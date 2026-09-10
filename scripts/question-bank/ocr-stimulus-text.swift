import Foundation
import ImageIO
import Vision

struct OCRResult: Codable {
  let path: String
  let text: String?
  let error: String?
}

func loadCGImage(path: String) -> CGImage? {
  let url = URL(fileURLWithPath: path)
  guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
    return nil
  }
  return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

func recognizeText(path: String) -> OCRResult {
  guard let image = loadCGImage(path: path) else {
    return OCRResult(path: path, text: nil, error: "failed_to_load_image")
  }

  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = false
  request.recognitionLanguages = ["en-US"]

  let handler = VNImageRequestHandler(cgImage: image, options: [:])

  do {
    try handler.perform([request])
    let lines = (request.results ?? [])
      .compactMap { observation in
        observation.topCandidates(1).first?.string
      }
    return OCRResult(
      path: path,
      text: lines.joined(separator: "\n"),
      error: nil
    )
  } catch {
    return OCRResult(path: path, text: nil, error: "\(error)")
  }
}

let paths = Array(CommandLine.arguments.dropFirst())
let results = paths.map(recognizeText)
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

do {
  let data = try encoder.encode(results)
  if let output = String(data: data, encoding: .utf8) {
    print(output)
  } else {
    fputs("failed_to_encode_output\n", stderr)
    exit(1)
  }
} catch {
  fputs("failed_to_encode_output: \(error)\n", stderr)
  exit(1)
}
