package com.adhx.share.net

import com.adhx.share.data.Connection
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.TimeUnit

class ImageAuthenticationTest {
    @Test fun `authenticated image client sends key only to paired origin`() {
        MockWebServer().use { paired ->
            MockWebServer().use { other ->
                paired.enqueue(MockResponse().setBody("image"))
                other.enqueue(MockResponse().setBody("preview"))
                val connection = Connection(paired.url("/").toString(), "image-key")
                val client = OkHttpClient.Builder().addInterceptor(ServerAuthInterceptor { connection }).build()
                client.newCall(Request.Builder().url(paired.url("/avatar")).build()).execute().close()
                client.newCall(Request.Builder().url(other.url("/preview")).build()).execute().close()
                assertEquals("Bearer image-key", paired.takeRequest(2, TimeUnit.SECONDS)!!.getHeader("Authorization"))
                assertNull(other.takeRequest(2, TimeUnit.SECONDS)!!.getHeader("Authorization"))
            }
        }
    }

    @Test fun `cross origin redirect does not forward phone credential`() {
        MockWebServer().use { paired ->
            MockWebServer().use { external ->
                external.enqueue(MockResponse().setBody("image"))
                paired.enqueue(MockResponse().setResponseCode(302).addHeader("Location", external.url("/image")))
                val client = OkHttpClient.Builder().addInterceptor(ServerAuthInterceptor {
                    Connection(paired.url("/").toString(), "private-phone-key")
                }).build()
                client.newCall(Request.Builder().url(paired.url("/redirect")).build()).execute().close()
                assertEquals("Bearer private-phone-key", paired.takeRequest(2, TimeUnit.SECONDS)!!.getHeader("Authorization"))
                assertNull(external.takeRequest(2, TimeUnit.SECONDS)!!.getHeader("Authorization"))
            }
        }
    }

    @Test fun `image cache is separated by server and credential without storing secret`() {
        val first = Connection("https://one.test", "do-not-cache-this-secret")
        assertEquals(AccountImageCache.scope(first), AccountImageCache.scope(first.copy(username = "new name")))
        assertNotEquals(AccountImageCache.scope(first), AccountImageCache.scope(first.copy(key = "rotated")))
        assertNotEquals(AccountImageCache.scope(first), AccountImageCache.scope(first.copy(server = "https://two.test")))
        assertFalse(AccountImageCache.scope(first).contains(first.key))
        assertEquals("unpaired", AccountImageCache.scope(null))
    }
}
