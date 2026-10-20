package com.adhx.share

import android.app.Application
import android.content.Context
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.network.cachecontrol.CacheControlCacheStrategy
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import com.adhx.share.data.ConnectionStore
import com.adhx.share.net.ServerAuthInterceptor
import com.adhx.share.net.AccountImageCache
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class AdhxApp : Application(), SingletonImageLoader.Factory {
    // Coil 3 needs an explicit network component. Keep the host-scoped phone
    // authentication and honour server cache headers, including no-store.
    @OptIn(coil3.annotation.ExperimentalCoilApi::class)
    override fun newImageLoader(context: Context): ImageLoader {
        val store = ConnectionStore.get(this)
        return ImageLoader.Builder(context)
            .components {
                add(AccountImageCache { store.current() })
                add(OkHttpNetworkFetcherFactory(
                    callFactory = {
                        OkHttpClient.Builder()
                            .connectTimeout(30, TimeUnit.SECONDS)
                            .readTimeout(30, TimeUnit.SECONDS)
                            .callTimeout(45, TimeUnit.SECONDS)
                            .addInterceptor(ServerAuthInterceptor { store.current() })
                            .build()
                    },
                    cacheStrategy = { CacheControlCacheStrategy() },
                ))
            }
            .crossfade(true)
            .build()
    }
}
