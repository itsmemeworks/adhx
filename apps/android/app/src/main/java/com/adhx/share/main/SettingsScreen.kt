package com.adhx.share.main

import androidx.compose.foundation.text.selection.SelectionContainer
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.data.Connection
import com.adhx.share.data.SettingsPrefs
import com.adhx.share.data.ShareState
import com.adhx.share.doing.DoingViewModel
import com.adhx.share.feed.FeedFilterSheet
import com.adhx.share.feed.FeedViewModel
import com.adhx.share.links.Links
import com.adhx.share.net.JoinDecision
import com.adhx.share.net.JoinRequest
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.AdhxSwitch
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.Faces
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.SettingsCopy
import com.adhx.share.ui.faceColor

/** The red of Remove and Decline. */
private val Danger = Color(0xFFFF8F7A)

/** Green: connected. */
private val Online = Color(0xFF7FD1AE)

/** What Settings can open. */
class SettingsActions(
    val onBack: () -> Unit,
    val onPeople: () -> Unit,
    val onDoing: () -> Unit,
    val onSharedLately: () -> Unit,
)

/**
 * Settings (j8-4): you, people waiting to be let in (admins), Your people,
 * Invite, the feed filter, Just for me and Sound by default, what your ADHX
 * is doing, Shared lately, and this phone's connection.
 *
 * Change picture ([PictureFlow]) and Invite someone ([InviteSheet]) happen
 * here on the phone, through `/api/app/me/avatar` and `/api/app/invites`.
 */
@Composable
fun SettingsScreen(
    vm: MainViewModel,
    people: PeopleViewModel,
    doing: DoingViewModel,
    feed: FeedViewModel,
    connection: Connection,
    actions: SettingsActions,
) {
    val context = LocalContext.current
    val prefs = remember { SettingsPrefs.get(context) }
    val items by vm.items.collectAsStateWithLifecycle()
    val reach by vm.reach.collectAsStateWithLifecycle()
    val peopleUi by people.ui.collectAsStateWithLifecycle()
    val doingUi by doing.ui.collectAsStateWithLifecycle()
    val feedUi by feed.feed.collectAsStateWithLifecycle()
    val waiting = items.count { it.state == ShareState.QUEUED }
    var notice by rememberSaveable { mutableStateOf<String?>(null) }
    var confirmRemove by rememberSaveable { mutableStateOf(false) }
    var filterOpen by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(connection.key) {
        people.load()
        doing.refresh()
    }

    val list = peopleUi.people
    val you = list?.you
    val username = you?.username ?: connection.username?.trim()?.trimStart('@')?.takeIf { it.isNotEmpty() }
    var pictureOpen by rememberSaveable { mutableStateOf(false) }
    var inviteOpen by rememberSaveable { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Background)
            .systemBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.height(52.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(AdhxColors.Surface)
                    .clickable(onClickLabel = SettingsCopy.BACK, onClick = actions.onBack)
                    .semantics { contentDescription = SettingsCopy.BACK },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Glyphs.Back, contentDescription = null, tint = AdhxColors.Cream, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(10.dp))
            Text(SettingsCopy.TITLE, fontFamily = SerifFamily, fontSize = 32.sp, color = AdhxColors.White, modifier = Modifier.semantics { heading() })
        }

        // You
        Section {
            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                // The pencil sits on the face's corner, outside its shape.
                Box(
                    Modifier.clickable(
                        onClickLabel = SettingsCopy.CHANGE_PICTURE,
                        interactionSource = null,
                        indication = null,
                    ) { pictureOpen = true },
                ) {
                    Avatar(
                        username = username.orEmpty(),
                        label = you?.label ?: username.orEmpty(),
                        avatarUrl = you?.avatarUrl,
                        server = connection.server,
                        size = 64.dp,
                        ring = faceColor(username.orEmpty()),
                        isYou = true,
                    )
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .offset(x = 2.dp, y = 2.dp)
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(AdhxColors.Surface)
                            .padding(3.dp)
                            .clip(CircleShape)
                            .background(AdhxColors.Accent)
                            .clearAndSetSemantics { },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Edit, contentDescription = null, tint = AdhxColors.Black, modifier = Modifier.size(11.dp))
                    }
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(
                        you?.label ?: username ?: "You",
                        fontSize = 19.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = AdhxColors.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        SettingsCopy.youLine(username, you?.saves),
                        fontSize = 13.sp,
                        color = AdhxColors.Faint,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.width(8.dp))
                PillButton(
                    SettingsCopy.CHANGE_PICTURE,
                    filled = false,
                    enabled = true,
                    onClick = { pictureOpen = true },
                    height = 40,
                    fontSize = 14,
                )
            }
        }

        // Waiting for you (admins)
        val requests = list?.takeIf { it.isAdmin }?.requests.orEmpty()
        if (requests.isNotEmpty()) {
            WaitingCard(
                requests = requests,
                server = connection.server,
                deciding = peopleUi.deciding,
                errors = peopleUi.decisionErrors,
                onDecide = people::decide,
            )
        }

        Section {
            val others = list?.members.orEmpty().filterNot { it.isYou || it.banned }
            NavRow(SettingsCopy.YOUR_PEOPLE, onClick = actions.onPeople) {
                if (others.isNotEmpty()) {
                    Faces(
                        savers = others.map { it.asSaver },
                        server = connection.server,
                        size = 26.dp,
                        ring = AdhxColors.Surface,
                    )
                }
                // Your people are everyone else let in ("4": Ana, Ben, Mum and Jo), as on the boards.
                list?.members?.count { !it.banned && !it.isYou }?.let { Value(it.toString()) }
            }
            if (list == null || list.canInvite) {
                Divider()
                NavRow(SettingsCopy.INVITE, onClick = { inviteOpen = true })
            }
            Divider()
            NavRow(SettingsCopy.FEED, onClick = { filterOpen = true }) {
                Value(SettingsCopy.feedTypes(feedUi.types))
            }
            Divider()
            val privateDefault = prefs.privateDefault
            SwitchRow(
                title = SettingsCopy.PRIVATE_DEFAULT,
                note = when (privateDefault) {
                    null -> SettingsCopy.PRIVATE_DEFAULT_UNSET
                    true -> SettingsCopy.PRIVATE_DEFAULT_NOTE
                    false -> SettingsCopy.PRIVATE_DEFAULT_OFF
                },
                on = privateDefault == true,
                onChange = { prefs.privateDefault = it },
            )
            Divider()
            SwitchRow(title = SettingsCopy.SOUND_DEFAULT, on = prefs.soundOn, onChange = { prefs.soundOn = it })
            if (!doingUi.unavailable) {
                Divider()
                NavRow(SettingsCopy.DOING, note = SettingsCopy.doingSummary(doingUi.view?.summary), onClick = actions.onDoing)
            }
        }

        // This phone, then Shared lately (the spec's order; the boards end on This phone).
        Section {
            Row(
                Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier
                        .size(9.dp)
                        .clip(CircleShape)
                        .background(
                            when (reach) {
                                Reach.Connected -> Online
                                Reach.Unreachable -> AdhxColors.Warn
                                Reach.Checking -> AdhxColors.Faint
                            },
                        ),
                )
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        SettingsCopy.connectedTo(list?.owner),
                        fontSize = 14.sp,
                        lineHeight = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = AdhxColors.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        Links.host(connection.server),
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        color = AdhxColors.Faint,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                QuietButton(SettingsCopy.REMOVE_PHONE) { confirmRemove = true }
            }
        }

        Section {
            NavRow(SettingsCopy.SHARED_LATELY, note = SettingsCopy.waitingLinks(waiting), onClick = actions.onSharedLately)
        }
        if (waiting > 0 || notice != null) {
            OutlineButton(
                SettingsCopy.SEND_WAITING,
                onClick = {
                    val sent = vm.sendWaitingNow()
                    notice = SettingsCopy.sending(sent)
                },
                enabled = waiting > 0,
                minHeight = 44.dp,
                modifier = Modifier.fillMaxWidth(),
            )
            notice?.let { Text(it, fontSize = 13.sp, color = AdhxColors.Faint) }
        }

        // Which release this phone runs, to match against the GitHub tags.
        versionName(context)?.let {
            SelectionContainer {
                Text(
                    "ADHX Share $it",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = AdhxColors.Muted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                )
            }
        }
        Text(
            SettingsCopy.TAGLINE,
            fontSize = 12.sp,
            color = AdhxColors.Faint,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }

    if (filterOpen) {
        FeedFilterSheet(
            types = feedUi.types,
            mode = feedUi.mode,
            onApply = { types, mode ->
                filterOpen = false
                feed.applyFilter(types, mode)
            },
        )
    }

    if (pictureOpen) {
        PictureFlow(
            vm = vm,
            connection = connection,
            onChanged = { people.load() },
            onClose = { pictureOpen = false },
        )
    }

    if (inviteOpen) {
        InviteSheet(connection = connection, onClose = { inviteOpen = false })
    }

    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            containerColor = AdhxColors.Surface,
            titleContentColor = AdhxColors.White,
            textContentColor = AdhxColors.Muted,
            title = { Text(SettingsCopy.REMOVE_TITLE) },
            text = { Text(SettingsCopy.REMOVE_BODY) },
            confirmButton = {
                TextButton(onClick = {
                    confirmRemove = false
                    if (vm.disconnect()) prefs.forgetAccount()
                }) {
                    Text(SettingsCopy.REMOVE, color = AdhxColors.Warn, fontWeight = FontWeight.ExtraBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmRemove = false }) {
                    Text(SettingsCopy.CANCEL, color = AdhxColors.Cream, fontWeight = FontWeight.Bold)
                }
            },
        )
    }
}

/** People waiting to be let in: Let in, Not now and Decline for each. */
@Composable
private fun WaitingCard(
    requests: List<JoinRequest>,
    server: String,
    deciding: Set<String>,
    errors: Map<String, String>,
    onDecide: (JoinRequest, String) -> Unit,
) {
    val shape = RoundedCornerShape(22.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(AdhxColors.Surface)
            .border(1.dp, AdhxColors.Accent.copy(alpha = 0.45f), shape)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.semantics(mergeDescendants = true) { heading() },
        ) {
            Text(SettingsCopy.WAITING_FOR_YOU, fontSize = 13.sp, lineHeight = 17.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.8.sp, color = AdhxColors.Accent)
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier
                    .heightIn(min = 20.dp)
                    .clip(RoundedCornerShape(50))
                    .background(AdhxColors.Accent)
                    .padding(horizontal = 7.dp, vertical = 2.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(requests.size.toString(), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.Black)
            }
        }
        requests.forEachIndexed { i, request ->
            if (i > 0) Divider()
            val busy = request.id in deciding
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics(mergeDescendants = true) { }) {
                Avatar(request.username, request.label, null, server, 44.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(SettingsCopy.wantsIn(request), fontSize = 15.sp, lineHeight = 19.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.White)
                    Text(SettingsCopy.requestLine(request), fontSize = 13.sp, lineHeight = 17.sp, color = AdhxColors.Faint, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (busy) {
                    CircularProgressIndicator(Modifier.size(20.dp), color = AdhxColors.Accent, strokeWidth = 2.dp)
                } else {
                    // Decline sits quietly at the end of the row, so the two buttons stay as on the boards.
                    QuietButton(SettingsCopy.DECLINE) { onDecide(request, JoinDecision.DECLINE) }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PillButton(
                    SettingsCopy.letIn(request),
                    filled = true,
                    enabled = !busy,
                    onClick = { onDecide(request, JoinDecision.APPROVE) },
                    modifier = Modifier.weight(1f),
                )
                PillButton(
                    SettingsCopy.NOT_NOW,
                    filled = false,
                    enabled = !busy,
                    onClick = { onDecide(request, JoinDecision.NOT_NOW) },
                    modifier = Modifier.weight(1f),
                )
            }
            errors[request.id]?.let { Text(it, fontSize = 13.sp, color = AdhxColors.Warn) }
        }
    }
}

/** A quiet red text action at a row's end (Remove this phone, Decline): 36dp tall, as on the boards. */
@Composable
private fun QuietButton(text: String, onClick: () -> Unit) {
    Box(
        Modifier
            .height(36.dp)
            .clip(RoundedCornerShape(50))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Danger, maxLines = 1)
    }
}

@Composable
private fun PillButton(
    text: String,
    filled: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: Int = 44,
    fontSize: Int = 15,
) {
    val shape = RoundedCornerShape(50)
    Box(
        modifier
            .height(height.dp)
            .clip(shape)
            .then(if (filled) Modifier.background(AdhxColors.Accent) else Modifier.border(1.dp, AdhxColors.Hairline, shape))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            fontSize = fontSize.sp,
            fontWeight = if (filled) FontWeight.ExtraBold else FontWeight.Bold,
            color = if (filled) AdhxColors.Black else AdhxColors.Cream,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 14.dp),
        )
    }
}

@Composable
private fun Section(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(AdhxColors.Surface),
        content = content,
    )
}

@Composable
private fun Divider() = HorizontalDivider(thickness = 1.dp, color = Color.White.copy(alpha = 0.06f))

@Composable
private fun Value(text: String) {
    Text(text, fontSize = 14.sp, color = AdhxColors.Faint, maxLines = 1)
}

/** A row that opens something: the title (and a line), what it's set to, and a chevron. */
@Composable
private fun NavRow(
    title: String,
    onClick: () -> Unit,
    note: String? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = if (note != null) 60.dp else 56.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Cream)
            note?.let { Text(it, fontSize = 12.sp, color = AdhxColors.Faint, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
        trailing()
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = AdhxColors.Faint,
            modifier = Modifier.size(18.dp),
        )
    }
}

/** A setting that's on or off. The whole row toggles. */
@Composable
private fun SwitchRow(title: String, on: Boolean, onChange: (Boolean) -> Unit, note: String? = null) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = if (note != null) 60.dp else 56.dp)
            .toggleable(value = on, role = Role.Switch, onValueChange = onChange)
            .semantics(mergeDescendants = true) { stateDescription = if (on) "On" else "Off" }
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Cream)
            note?.let { Text(it, fontSize = 12.sp, color = AdhxColors.Faint) }
        }
        AdhxSwitch(on)
    }
}

@Suppress("DEPRECATION")
private fun versionName(context: Context): String? = try {
    context.packageManager.getPackageInfo(context.packageName, 0).versionName
} catch (e: Exception) {
    null
}
