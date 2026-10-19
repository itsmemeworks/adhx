package com.adhx.share

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import com.adhx.share.data.ConnectionStore
import com.adhx.share.net.ServerAuthInterceptor
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class AdhxApp : Application(), ImageLoaderFactory {

    // A poster that isn't kept yet can take the server a while (it waits for
    // the download before handing off to the network), so wait as long as the
    // player does instead of Coil's 10 seconds. Members' pictures need the
    // phone key, sent to the connected ADHX only.
    override fun newImageLoader(): ImageLoader {
        val store = ConnectionStore.get(this)
        return ImageLoader.Builder(this)
            .okHttpClient {
                OkHttpClient.Builder()
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .addInterceptor(ServerAuthInterceptor { store.current() })
                    .build()
            }
            .crossfade(true)
            .build()
    }
}
