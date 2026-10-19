package com.adhx.share.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.data.Connection
import com.adhx.share.data.ShareState
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.OutlineButton

/** Server address, who the key saves for, the waiting links, and Disconnect. */
@Composable
fun SettingsScreen(vm: MainViewModel, connection: Connection, onBack: () -> Unit) {
    val items by vm.items.collectAsStateWithLifecycle()
    val waiting = items.count { it.state == ShareState.QUEUED }
    var notice by rememberSaveable { mutableStateOf<String?>(null) }
    var confirmDisconnect by rememberSaveable { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Background)
            .systemBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Box(
            Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(AdhxColors.Surface)
                .clickable(onClick = onBack),
            contentAlignment = androidx.compose.ui.Alignment.Center,
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = AdhxColors.White, modifier = Modifier.size(22.dp))
        }

        Text("Settings", style = MaterialTheme.typography.displaySmall, color = AdhxColors.White)

        Card {
            Label("Your ADHX")
            Text(connection.server, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = AdhxColors.White)
            val username = connection.username?.trim()?.trimStart('@')?.takeIf { it.isNotEmpty() }
            Text(
                if (username != null) "Connected as @$username" else "Connected",
                fontSize = 13.sp,
                color = AdhxColors.Muted,
            )
            connection.phoneName?.let {
                Text("This phone shows up as “$it”", fontSize = 13.sp, color = AdhxColors.Faint)
            }
        }

        Card {
            Label("Waiting links")
            Text(
                when (waiting) {
                    0 -> "Nothing is waiting."
                    1 -> "1 link is waiting for a connection."
                    else -> "$waiting links are waiting for a connection."
                },
                fontSize = 14.sp,
                color = AdhxColors.Muted,
            )
            OutlineButton(
                "Send waiting links now",
                onClick = {
                    val sent = vm.sendWaitingNow()
                    notice = when (sent) {
                        0 -> "Nothing is waiting."
                        1 -> "Sending 1 link as soon as there’s a connection."
                        else -> "Sending $sent links as soon as there’s a connection."
                    }
                },
                enabled = waiting > 0,
                minHeight = 48.dp,
                modifier = Modifier.fillMaxWidth(),
            )
            notice?.let { Text(it, fontSize = 13.sp, color = AdhxColors.Faint) }
        }

        OutlineButton(
            "Disconnect",
            onClick = { confirmDisconnect = true },
            color = AdhxColors.Warn,
            modifier = Modifier.fillMaxWidth(),
        )

        Text(
            "The app only talks to your ADHX.",
            fontSize = 12.sp,
            color = AdhxColors.Faint,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }

    if (confirmDisconnect) {
        AlertDialog(
            onDismissRequest = { confirmDisconnect = false },
            containerColor = AdhxColors.Surface,
            titleContentColor = AdhxColors.White,
            textContentColor = AdhxColors.Muted,
            title = { Text("Disconnect this phone?") },
            text = {
                Text(
                    "This forgets the key and the list of shared posts on this phone, and drops links still waiting. " +
                        "To remove the phone from your ADHX too, use Settings → Phone app there.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmDisconnect = false
                    vm.disconnect()
                }) {
                    Text("Disconnect", color = AdhxColors.Warn, fontWeight = FontWeight.ExtraBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDisconnect = false }) {
                    Text("Cancel", color = AdhxColors.Cream, fontWeight = FontWeight.Bold)
                }
            },
        )
    }
}

@Composable
private fun Card(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(AdhxColors.Surface)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        content = content,
    )
}

@Composable
private fun Label(text: String) {
    Text(
        text.uppercase(),
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.sp,
        color = AdhxColors.Faint,
    )
}
