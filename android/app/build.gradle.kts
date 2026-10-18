plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// El número de versión sube solo con cada compilación en GitHub.
val numero = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "cl.matias.finanzasnotif"
    compileSdk = 35

    defaultConfig {
        applicationId = "cl.matias.finanzasnotif"
        minSdk = 29
        targetSdk = 35
        versionCode = numero
        versionName = "1.$numero"
    }

    // Firma fija: así cada versión nueva se instala encima de la anterior sin desinstalar.
    signingConfigs {
        create("propia") {
            storeFile = file("../firma.jks")
            storePassword = "finanzas-notif"
            keyAlias = "finanzas"
            keyPassword = "finanzas-notif"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("propia")
        }
        debug {
            signingConfig = signingConfigs.getByName("propia")
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
    implementation("androidx.work:work-runtime-ktx:2.10.0")
}
