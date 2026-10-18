package fun.hushcross.app;

import android.net.Uri;

/** Browser-owned web state: no native wallet storage, credential bridge or URL logging. */
public final class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    @Override
    protected Uri getLaunchingUrl() {
        Uri requested = super.getLaunchingUrl();
        if (requested != null
                && "https".equalsIgnoreCase(requested.getScheme())
                && "hushcross.fun".equalsIgnoreCase(requested.getHost())
                && requested.getUserInfo() == null
                && (requested.getPort() == -1 || requested.getPort() == 443)) {
            return requested;
        }
        return Uri.parse("https://hushcross.fun/");
    }
}
