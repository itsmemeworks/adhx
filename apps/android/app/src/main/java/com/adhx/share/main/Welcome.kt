package com.adhx.share.main

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** "Connected to …": shown once, right after this phone pairs. */
object Welcome {
    var pending by mutableStateOf(false)
}
