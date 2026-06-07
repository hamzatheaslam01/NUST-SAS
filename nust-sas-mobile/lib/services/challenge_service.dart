import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../config.dart';

/// Challenge types that match the backend
/// Challenge types that match the backend
enum ChallengeType {
  smile('smile', 'Please SMILE at the camera'),
  blink('blink', 'Blink your eyes'),
  turnHeadLeft('turn_head_left', 'Turn your head slightly LEFT'),
  turnHeadRight('turn_head_right', 'Turn your head slightly RIGHT');

  final String value;
  final String baseInstruction;
  const ChallengeType(this.value, this.baseInstruction);
}

/// Challenge definition with type and parameter
class Challenge {
  final ChallengeType type;
  final int param;
  final String instruction;

  Challenge({
    required this.type,
    required this.param,
    required this.instruction,
  });
  
  // Helpers removed as they are no longer needed for complex logic
  // but kept if any other code depends on them, simplified.
  bool get requiresFaceDetection => true; // All now require face
}

/// Derives a deterministic challenge from a seed.
/// This MUST produce the same result as the backend for verification to work.
Challenge deriveChallenge(String seed) {
  // SHA256 hash of the seed
  final bytes = sha256.convert(utf8.encode(seed)).bytes;
  
  // Get challenge type from first 2 bytes
  final typeIndex = (bytes[0] << 8 | bytes[1]) % ChallengeType.values.length;
  final type = ChallengeType.values[typeIndex];
  
  // Get parameter from next 2 bytes based on challenge type
  int param;
  switch (type) {
    case ChallengeType.smile:
    case ChallengeType.turnHeadLeft:
    case ChallengeType.turnHeadRight:
      param = 1;
      break;
    case ChallengeType.blink:
      // 1-3 blinks
      param = 1 + ((bytes[2] << 8 | bytes[3]) % 3);
      break;
  }
  
  // Generate instruction
  String instruction;
  switch (type) {
    case ChallengeType.smile:
      instruction = 'Please SMILE at the camera';
      break;
    case ChallengeType.blink:
      instruction = 'Blink your eyes $param time${param > 1 ? 's' : ''}';
      break;
    case ChallengeType.turnHeadLeft:
      instruction = 'Turn your head slightly LEFT';
      break;
    case ChallengeType.turnHeadRight:
      instruction = 'Turn your head slightly RIGHT';
      break;
  }
  
  return Challenge(type: type, param: param, instruction: instruction);
}

/// Parse a JWT token and extract the challenge seed
String? extractChallengeSeed(String qrToken) {
  try {
    // JWT format: header.payload.signature
    final parts = qrToken.split('.');
    if (parts.length != 3) return null;
    
    // Decode the payload (base64url)
    String payload = parts[1];
    // Add padding if needed
    while (payload.length % 4 != 0) {
      payload += '=';
    }
    payload = payload.replaceAll('-', '+').replaceAll('_', '/');
    
    final decoded = utf8.decode(base64.decode(payload));
    final json = jsonDecode(decoded) as Map<String, dynamic>;
    
    return json['challenge_seed'] as String?;
  } catch (e) {
    return null;
  }
}

/// Generate HMAC signature for challenge response to prevent tampering
String generateChallengeSignature({
  required String seed,
  required String challengeType,
  required int challengeParam,
  required int timestampMs,
}) {
  // Matches backend logic: seed|type|param|timestamp
  final message = '$seed|$challengeType|$challengeParam|$timestampMs';
  final secretKey = utf8.encode(Config.qrSecretKey);
  final hmac = Hmac(sha256, secretKey);
  final digest = hmac.convert(utf8.encode(message));
  return digest.toString();
}
