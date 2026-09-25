import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { useRef } from 'react';

// Load the self-contained HTML from the assets bundle
const html = require('../assets/index.html');

export default function App() {
  const webviewRef = useRef(null);

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#0A1628" />
      <WebView
        ref={webviewRef}
        source={html}
        style={styles.webview}
        // Allow geolocation permission requests from the WebView
        geolocationEnabled={true}
        // Allow mixed content (needed for Open-Meteo http fallback)
        mixedContentMode="always"
        // JS must be on for the app to function
        javaScriptEnabled={true}
        // Allow the page to access device features
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        // Smooth scrolling
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        // Dark background while loading
        backgroundColor="#0A1628"
        // Allow loading local file assets
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        originWhitelist={['*']}
        // Grant geolocation automatically — we've already declared the
        // Android manifest permissions in app.json
        onPermissionRequest={(request) => {
          request.grant(request.resources);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0A1628',
  },
});
