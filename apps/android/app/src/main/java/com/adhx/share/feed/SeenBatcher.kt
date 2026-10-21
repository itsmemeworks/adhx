package com.adhx.share.feed

import com.adhx.share.net.PostRef

/**
 * Which feed posts you've seen, sent to `POST /api/app/seen` in batches.
 *
 * A post counts as seen once it has been on stage for [dwellMs], or as soon
 * as you swipe past it to a later one. Each post is sent once; a batch that
 * didn't get through goes back in the queue. No clock or threads of its own:
 * the caller passes the time and decides when to [drain], which keeps it
 * testable.
 */
class SeenBatcher(
    private val dwellMs: Long = DWELL_MS,
    /** Send as soon as this many are waiting. */
    private val batchSize: Int = BATCH,
) {
    private var stage: PostRef? = null
    private var stageIndex = -1
    private var stagedAt = 0L

    /** Seen and not sent yet, in the order they were seen. */
    private val pending = LinkedHashMap<String, PostRef>()

    /** Seen and sent (or on the way): never sent again. */
    private val done = HashSet<String>()

    val waiting: Int get() = pending.size

    /** Every post counted as seen so far (`platform:id`), sent or not. */
    val counted: Set<String> get() = done

    /** Enough are waiting to send a batch now. */
    val full: Boolean get() = pending.size >= batchSize

    /**
     * [post] at [index] is on stage from [now]. Moving to a later page counts
     * the one left behind as seen (it was swiped past); going back doesn't.
     */
    fun onStage(post: PostRef?, index: Int, now: Long) {
        val before = stage
        if (before != null && index > stageIndex) mark(before)
        else if (before != null) tick(now)
        stage = post
        stageIndex = index
        stagedAt = now
    }

    /** Time has passed: the post on stage counts once it has been there long enough. */
    fun tick(now: Long) {
        val on = stage ?: return
        if (now - stagedAt >= dwellMs) mark(on)
    }

    fun mark(post: PostRef) {
        val key = key(post)
        if (key in done) return
        done.add(key)
        pending[key] = post
    }

    /** Take up to [MAX_BATCH] waiting posts to send. */
    fun drain(): List<PostRef> {
        val batch = pending.values.take(MAX_BATCH)
        batch.forEach { pending.remove(key(it)) }
        return batch
    }

    /** A batch didn't get through: queue it again, ahead of anything newer. */
    fun failed(batch: List<PostRef>) {
        val rest = pending.toMap()
        pending.clear()
        batch.forEach { pending[key(it)] = it }
        pending.putAll(rest)
    }

    /** A new feed (another mode, or a reload): forget what's on stage, keep what's waiting. */
    fun leaveStage(now: Long) {
        tick(now)
        stage = null
        stageIndex = -1
    }

    private fun key(post: PostRef) = "${post.platform}:${post.id}"

    companion object {
        const val DWELL_MS = 2_000L
        const val BATCH = 10

        /** The server takes at most 50 a time. */
        const val MAX_BATCH = 50

        /** Waiting posts are sent at least this often. */
        const val FLUSH_MS = 5_000L
    }
}
