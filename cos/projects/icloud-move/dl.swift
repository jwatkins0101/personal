import Foundation
let fm = FileManager.default
var ok = 0, err = 0
while let line = readLine() {
  let u = URL(fileURLWithPath: line)
  do { try fm.startDownloadingUbiquitousItem(at: u); ok += 1 } catch { err += 1; if err < 5 { FileHandle.standardError.write("\(line): \(error)\n".data(using:.utf8)!) } }
}
print("requested ok=\(ok) err=\(err)")
