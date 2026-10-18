package com.adhx.share

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class AdhxApp : Application(), ImageLoaderFactory {

    // A poster that isn't kept yet can take the server a while (it waits for
    // the download before handing off to the network), so wait as long as the
    // player does instead of Coil's 10 seconds.
    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .okHttpClient {
            OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build()
        }
        .crossfade(true)
        .build()
}
