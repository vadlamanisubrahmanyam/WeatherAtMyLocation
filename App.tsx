import { StatusBar } from 'expo-status-bar';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import WEATHER_HTML from './src/weatherHtml';

// The UI lives in web/ (HTML/CSS/JS) and is inlined into src/weatherHtml.ts by
// `node scripts/embed-html.js`. The page is served from https://localhost so it is a
// secure context (geolocation works) and can call the free weather APIs directly.
const BASE_URL = 'https://localhost';

function openExternally(url: string) {
  if (/^https?:\/\//i.test(url)) Linking.openURL(url).catch(() => {});
}

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#0A1628" />
      <WebView
        source={{ html: WEATHER_HTML, baseUrl: BASE_URL }}
        style={styles.webview}
        geolocationEnabled
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="compatibility"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        setSupportMultipleWindows
        backgroundColor="#0A1628"
        onPermissionRequest={(request) => request.grant(request.resources)}
        // Keep the app page in the WebView; links to other sites (map credits, Windy) open in the browser.
        onShouldStartLoadWithRequest={(req) => {
          const url = req.url || '';
          if (url.startsWith(BASE_URL) || url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return true;
          if ((req as { isTopFrame?: boolean }).isTopFrame === false) return true; // iframes (Windy map)
          openExternally(url);
          return false;
        }}
        onOpenWindow={(e) => openExternally(e.nativeEvent.targetUrl)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628' },
  webview: { flex: 1, backgroundColor: '#0A1628' },
});
