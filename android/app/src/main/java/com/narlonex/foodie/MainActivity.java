package com.narlonex.foodie;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Capacitor draws edge-to-edge on Android 15+. Keep the web header
        // below the status bar instead of letting the clock overlap it.
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets statusBars = windowInsets.getInsets(
                WindowInsetsCompat.Type.statusBars()
            );
            view.setPadding(0, statusBars.top, 0, 0);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);

        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        // AppUpdatePrompt reads this marker to avoid offering the APK that is
        // already installed. Older builds without the marker fall back to the
        // web app's last-seen release baseline.
        String userAgent = webView.getSettings().getUserAgentString();
        webView.getSettings().setUserAgentString(
            userAgent + " FoodieAndroid/" + BuildConfig.VERSION_NAME
        );

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(
                String url,
                String userAgent,
                String contentDisposition,
                String mimeType,
                long contentLength
            ) {
                try {
                    String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    String cookies = CookieManager.getInstance().getCookie(url);
                    if (cookies != null) {
                        request.addRequestHeader("Cookie", cookies);
                    }
                    if (userAgent != null) {
                        request.addRequestHeader("User-Agent", userAgent);
                    }
                    request.setMimeType(mimeType);
                    request.setTitle(fileName);
                    request.setDescription("Foodie download");
                    request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                    );
                    request.setDestinationInExternalPublicDir(
                        Environment.DIRECTORY_DOWNLOADS,
                        fileName
                    );

                    DownloadManager manager =
                        (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (manager != null) {
                        manager.enqueue(request);
                    }
                } catch (Exception ignored) {
                    // The web app remains usable if the system download service fails.
                }
            }
        });
    }

    @Override
    public void onBackPressed() {
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }
}
