plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The address of your live Startline site. Set with -PAPP_URL=https://your-app.onrender.com (the GitHub build does this).
val appUrl: String = (project.findProperty("APP_URL") as String?)?.trimEnd('/') ?: "https://startline.onrender.com"

android {
    namespace = "app.startline"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.startline.focus"
        minSdk = 26
        targetSdk = 35
        versionCode = (project.findProperty("VERSION_CODE") as String?)?.toInt() ?: 1
        versionName = "1.0"
        buildConfigField("String", "APP_URL", "\"$appUrl\"")
    }
    buildFeatures { buildConfig = true }
    signingConfigs {
        val ks = System.getenv("KEYSTORE_FILE")
        if (ks != null && file(ks).exists()) {
            create("release") {
                storeFile = file(ks)
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
}
