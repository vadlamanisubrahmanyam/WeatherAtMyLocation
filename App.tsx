import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#0A1628" />
      <WebView
        source={require('./assets/index.html')}
        style={styles.webview}
        geolocationEnabled={true}
        javaScriptEnabled={true}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        originWhitelist={['*']}
        mixedContentMode="always"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        backgroundColor="#0A1628"
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
