class Config {
  // Try these URLs in order until one works
  static const List<String> apiBaseUrls = [
    'http://10.75.167.36:8000', // Current Machine IP
    'http://10.0.2.2:8000',      // Android emulator
    'http://localhost:8000',     // iOS simulator
    'http://192.168.1.36:8000',  // Common router IP range
    'http://192.168.1.100:8000', // Common router IP range
    'http://192.168.0.100:8000', // Common router IP range
    'http://192.168.10.10:8000', // Common router IP range
    'http://127.0.0.1:8000',     // Localhost IP
  ];
  
  // Default URL for now - Using Android Emulator localhost
  static const String apiBaseUrl = 'http://10.75.167.36:8000';
  
  // Security Keys (Should be obfuscated in production)
  static const String qrSecretKey = '8474b1eb68103902e7dea3b8e81267c49173ea62999a4597b038d16bf277dd0c';
}
