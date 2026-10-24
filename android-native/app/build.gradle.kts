plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.hyperlog.rp"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hyperlog.rp"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "2.0.0"
    }

    signingConfigs {
        create("release") {
            storeFile = rootProject.file("keystore/mesotrack-release.jks")
            storePassword = System.getenv("HYPERLOG_KEYSTORE_PASSWORD") ?: "mesotrack2026"
            keyAlias = System.getenv("HYPERLOG_KEY_ALIAS") ?: "mesotrack_key"
            keyPassword = System.getenv("HYPERLOG_KEY_PASSWORD") ?: "mesotrack2026"
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // 100% Standalone Zero-Bloat Native Kotlin + Android SQLite + Skia Canvas
}
