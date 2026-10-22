package com.adhx.share.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.library.BarButton
import com.adhx.share.net.Person
import com.adhx.share.net.Saver
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.Copy
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.SettingsCopy
import com.adhx.share.ui.SquircleShape

/**
 * Settings → Your people: everyone let in on this ADHX, each with their
 * face, the saves you can see and when they last saved. A row opens their
 * saves (yours opens My saves).
 */
@Composable
fun PeopleScreen(people: PeopleViewModel, server: String, onBack: () -> Unit, onPerson: (Saver) -> Unit) {
    val ui by people.ui.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { people.load() }
    val members = ui.people?.members.orEmpty()

    Column(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Background)
            .statusBarsPadding()
            .padding(horizontal = 16.dp),
    ) {
        Row(Modifier.height(64.dp), verticalAlignment = Alignment.CenterVertically) {
            BarButton(com.adhx.share.ui.Glyphs.Back, "Back", onBack)
            Spacer(Modifier.width(12.dp))
            Text(
                SettingsCopy.YOUR_PEOPLE,
                fontFamily = SerifFamily,
                fontSize = 26.sp,
                color = AdhxColors.White,
                modifier = Modifier.semantics { heading() },
            )
        }
        when {
            ui.unavailable -> Text(SettingsCopy.PEOPLE_UNAVAILABLE, fontSize = 15.sp, color = AdhxColors.Muted)
            ui.people == null && ui.error != null -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(ui.error ?: SettingsCopy.PEOPLE_CANT_LOAD, fontSize = 15.sp, color = AdhxColors.Muted)
                OutlineButton("Try again", onClick = people::load, minHeight = 44.dp)
            }
            ui.people == null -> Box(Modifier.fillMaxWidth().padding(top = 30.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(34.dp), color = AdhxColors.Accent, trackColor = AdhxColors.Hairline, strokeWidth = 3.dp)
            }
            else -> LazyColumn(
                Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .clip(SquircleShape(22.dp))
                    .background(AdhxColors.Surface),
            ) {
                items(members, key = { it.username }) { person ->
                    PersonRow(person, server, onClick = { onPerson(person.asSaver) })
                }
                if (members.none { !it.isYou }) {
                    item {
                        Text(SettingsCopy.PEOPLE_EMPTY, fontSize = 14.sp, color = AdhxColors.Faint, modifier = Modifier.padding(16.dp))
                    }
                }
            }
        }
        Spacer(Modifier.navigationBarsPadding().height(16.dp))
    }
}

@Composable
private fun PersonRow(person: Person, server: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 68.dp)
            .clickable(role = Role.Button, onClickLabel = Copy.openChannelOf(person.asSaver), onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .semantics(mergeDescendants = true) { },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(person.username, person.label, person.avatarUrl, server, 44.dp, isYou = person.isYou)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                if (person.isYou) "${person.label} (you)" else person.label,
                fontSize = 15.sp,
                fontWeight = FontWeight.ExtraBold,
                color = AdhxColors.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(SettingsCopy.personLine(person), fontSize = 13.sp, color = AdhxColors.Faint, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        val last = Copy.shortAgoIso(person.lastSavedAt)
        when {
            person.banned -> Text(SettingsCopy.BANNED, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Warn)
            last != null -> Text(last, fontSize = 13.sp, color = AdhxColors.Faint)
        }
    }
}
