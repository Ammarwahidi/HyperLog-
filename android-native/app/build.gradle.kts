// ============================================================================
// HyperLog Android Build Recipe (build.gradle.kts)
// Think of this file like the instruction manual that tells Android Studio &
// Gradle how to bake our Kotlin code into a signed, installable .APK file!
// ============================================================================
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    // Unique package address on Android phones (used by Google Play & Health Connect)
    namespace = "com.hyperlog.rp"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hyperlog.rp"
        // minSdk 26 = Android 8.0+ (works on 98%+ of active Android phones)
        minSdk = 26
        // targetSdk 35 = Android 15 (latest security & edge-to-edge display rules)
        targetSdk = 35
        // Increment versionCode every time we build a new release APK
        versionCode = 18
        versionName = "4.0.0"
    }

    // Digital wax seal: Android refuses to install an APK unless it is cryptographically signed.
    // Enabling V1 (JAR), V2 (Full APK), and V3 (Key Rotation) ensures smooth installation on all phones.
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

    // Compile using modern Java 17 bytecode for fast execution on Android ART
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Zero external library bloat! HyperLog uses 100% built-in Android SDK APIs:
    // SQLiteOpenHelper (database), Skia Canvas (charts & anatomy map), AudioTrack (PCM breath audio),
    // PdfDocument (workout PDFs), and AppWidgetProvider (Home Screen streak widget).
}

