plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Versionsnummer = laufende Nummer des GitHub-Actions-Laufs, damit jede neue APK über die alte installiert
val versionNr = (System.getenv("VERSION_CODE") ?: "1").toInt()

android {
    namespace = "io.github.salamandercreator.bauchtagebuch"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.salamandercreator.bauchtagebuch"
        minSdk = 26
        targetSdk = 34
        versionCode = versionNr
        versionName = "1.$versionNr"
    }

    // Signierschlüssel kommt nur in GitHub Actions aus den Secrets (nie im Code)
    signingConfigs {
        create("release") {
            val datei = System.getenv("APK_SCHLUESSEL_DATEI")
            if (datei != null) {
                storeFile = file(datei)
                storePassword = System.getenv("APK_SCHLUESSEL_PASSWORT")
                keyAlias = "bauchtagebuch"
                keyPassword = System.getenv("APK_SCHLUESSEL_PASSWORT")
                storeType = "pkcs12"
            }
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
    // Garmin Connect IQ Mobile SDK (kostenlos, Maven Central)
    implementation("com.garmin.connectiq:ciq-companion-app-sdk:2.0.3@aar")
    testImplementation("junit:junit:4.13.2")
}
