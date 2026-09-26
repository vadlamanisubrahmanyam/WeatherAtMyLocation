import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#0A1628" />
      <WebView
        // Load the bundled HTML from assets
        source={require('./assets/index.html')}
        style={styles.webview}
        // Location
        geolocationEnabled={true}
        // JS
        javaScriptEnabled={true}
        domStorageEnabled={true}
        // File access — needed for local asset loading
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        originWhitelist={['*']}
        // Allow local file:// page to call https:// APIs
        mixedContentMode="always"
        // UI
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        backgroundColor="#0A1628"
        // Auto-grant location permission from the WebView
        onPermissionRequest={(request) => request.grant(request.resources)}
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
