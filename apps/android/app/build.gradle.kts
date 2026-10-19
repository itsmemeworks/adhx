import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Release signing is optional: put the values in apps/android/keystore.properties
// (storeFile, storePassword, keyAlias, keyPassword) or in the environment
// (ADHX_KEYSTORE, ADHX_KEYSTORE_PASSWORD, ADHX_KEY_ALIAS, ADHX_KEY_PASSWORD).
// Without them the release APK is built unsigned and the debug build needs nothing.
val keystoreProps = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

fun signingValue(prop: String, env: String): String? =
    keystoreProps.getProperty(prop)?.takeIf { it.isNotBlank() }
        ?: System.getenv(env)?.takeIf { it.isNotBlank() }

val releaseStoreFile = signingValue("storeFile", "ADHX_KEYSTORE")
val hasReleaseSigning = releaseStoreFile != null &&
    signingValue("storePassword", "ADHX_KEYSTORE_PASSWORD") != null &&
    signingValue("keyAlias", "ADHX_KEY_ALIAS") != null

android {
    namespace = "com.adhx.share"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.adhx.share"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("ADHX_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("ADHX_VERSION_NAME") ?: "1.0.0"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = rootProject.file(releaseStoreFile!!)
                storePassword = signingValue("storePassword", "ADHX_KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "ADHX_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "ADHX_KEY_PASSWORD")
                    ?: signingValue("storePassword", "ADHX_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("com.squareup.okhttp3:mockwebserver:5.5.0")
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.core)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.security.crypto)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.coil.network.cache.control)
    implementation(libs.zxing.android.embedded)
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.ui)
}

// Audit the actual transitive runtime graph, not only the declared version catalog.
tasks.register("exportRuntimeDependencies") {
    val report = layout.buildDirectory.file("reports/runtime-dependencies.json")
    outputs.file(report)
    outputs.upToDateWhen { false }
    doLast {
        val modules = configurations.getByName("debugRuntimeClasspath")
            .incoming.resolutionResult.allComponents
            .filter { it.id is org.gradle.api.artifacts.component.ModuleComponentIdentifier }
            .mapNotNull { it.moduleVersion }
            .map { "${it.group}:${it.name}" to it.version }.distinct().sortedBy { it.first }
        val output = report.get().asFile
        output.parentFile.mkdirs()
        output.writeText(modules.joinToString(",\n", "[\n", "\n]\n") { (name, version) ->
            "  {\"name\":\"$name\",\"version\":\"$version\"}"
        })
    }
}
