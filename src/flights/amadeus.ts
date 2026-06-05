// Amadeus API client for flight offer searches

interface AmadeusToken {
  access_token: string;
  expires_at: number;
}

let cachedToken: AmadeusToken | null = null;

const BASE_URL = process.env.AMADEUS_BASE_URL || "https://test.api.amadeus.com";

/**
 * Get an OAuth2 token from Amadeus.
 */
async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expires_at > Date.now() + 60_000) {
    return cachedToken.access_token;
  }

  const clientId = process.env.AMADEUS_API_KEY;
  const clientSecret = process.env.AMADEUS_API_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "AMADEUS_API_KEY and AMADEUS_API_SECRET must be set. " +
      "Sign up free at https://developers.amadeus.com"
    );
  }

  const res = await fetch(`${BASE_URL}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amadeus auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.access_token;
}

export interface FlightOffer {
  airline: string;
  airlineName: string;
  price: number;
  currency: string;
  cabinClass: string;
  stops: number;
  totalDurationMinutes: number;
  outbound: {
    departure: string;
    arrival: string;
    segments: SegmentInfo[];
  };
  return: {
    departure: string;
    arrival: string;
    segments: SegmentInfo[];
  };
  raw: any;
}

interface SegmentInfo {
  carrier: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  departureAirport: string;
  arrivalAirport: string;
  duration: string;
}

/**
 * Parse ISO 8601 duration (e.g. "PT10H30M") to minutes.
 */
function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  return (parseInt(match[1] || "0") * 60) + parseInt(match[2] || "0");
}

/**
 * Search for flight offers.
 */
export async function searchFlights(params: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  cabinClass: string;
  passengers: number;
  maxResults?: number;
}): Promise<FlightOffer[]> {
  const token = await getToken();
  const maxResults = params.maxResults || 10;

  const query = new URLSearchParams({
    originLocationCode: params.origin,
    destinationLocationCode: params.destination,
    departureDate: params.departDate,
    returnDate: params.returnDate,
    adults: String(params.passengers),
    travelClass: params.cabinClass,
    max: String(maxResults),
    currencyCode: "USD",
    nonStop: "false",
  });

  const res = await fetch(
    `${BASE_URL}/v2/shopping/flight-offers?${query}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amadeus flight search failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const dictionaries = data.dictionaries || {};
  const carriers = dictionaries.carriers || {};

  return (data.data || []).map((offer: any): FlightOffer => {
    const itineraries = offer.itineraries || [];
    const outbound = itineraries[0] || {};
    const returnItin = itineraries[1] || {};

    const outSegments = (outbound.segments || []).map((s: any) => ({
      carrier: s.carrierCode,
      flightNumber: `${s.carrierCode}${s.number}`,
      departure: s.departure.at,
      arrival: s.arrival.at,
      departureAirport: s.departure.iataCode,
      arrivalAirport: s.arrival.iataCode,
      duration: s.duration,
    }));

    const retSegments = (returnItin.segments || []).map((s: any) => ({
      carrier: s.carrierCode,
      flightNumber: `${s.carrierCode}${s.number}`,
      departure: s.departure.at,
      arrival: s.arrival.at,
      departureAirport: s.departure.iataCode,
      arrivalAirport: s.arrival.iataCode,
      duration: s.duration,
    }));

    const mainCarrier = outSegments[0]?.carrier || "Unknown";
    const totalDuration =
      parseDuration(outbound.duration || "") +
      parseDuration(returnItin.duration || "");

    return {
      airline: mainCarrier,
      airlineName: carriers[mainCarrier] || mainCarrier,
      price: parseFloat(offer.price.total),
      currency: offer.price.currency || "USD",
      cabinClass: params.cabinClass,
      stops: Math.max(outSegments.length - 1, 0),
      totalDurationMinutes: totalDuration,
      outbound: {
        departure: outSegments[0]?.departure || "",
        arrival: outSegments[outSegments.length - 1]?.arrival || "",
        segments: outSegments,
      },
      return: {
        departure: retSegments[0]?.departure || "",
        arrival: retSegments[retSegments.length - 1]?.arrival || "",
        segments: retSegments,
      },
      raw: offer,
    };
  });
}

/**
 * Search multiple cabin classes in parallel.
 */
export async function searchAllCabins(params: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  passengers: number;
}): Promise<{ business: FlightOffer[]; premiumEconomy: FlightOffer[]; economy: FlightOffer[] }> {
  const [business, premiumEconomy, economy] = await Promise.all([
    searchFlights({ ...params, cabinClass: "BUSINESS", maxResults: 5 }).catch(() => []),
    searchFlights({ ...params, cabinClass: "PREMIUM_ECONOMY", maxResults: 5 }).catch(() => []),
    searchFlights({ ...params, cabinClass: "ECONOMY", maxResults: 5 }).catch(() => []),
  ]);

  return { business, premiumEconomy, economy };
}
