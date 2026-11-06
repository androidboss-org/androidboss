/** Kotlin inputs for the page and the tests. Both are compiled into a real framework by swift-interop.kmp.test.ts. */

/** The sample on the page. Also compiled into a real framework in swift-interop.kmp.test.ts. */
export const SAMPLE = `package com.example.shared

data class User(val id: Long, val name: String, val avatarUrl: String? = null)

enum class Theme { LIGHT, DARK, SYSTEM }

sealed class LoadState {
    data object Loading : LoadState()
    data class Ready(val users: List<User>) : LoadState()
    data class Failed(val message: String) : LoadState()
}

interface UserRepository {
    suspend fun users(): List<User>
    fun cached(id: Long): User?
}

class UserViewModel(private val repo: UserRepository) {
    var theme: Theme = Theme.SYSTEM
    val pageSize: Int = 20

    suspend fun refresh(force: Boolean = false): LoadState = LoadState.Loading

    fun observe(onChange: (LoadState) -> Unit) {}

    fun copyLink(user: User): String = ""

    companion object {
        const val MAX_USERS = 500
    }
}

object Analytics {
    fun track(event: String, props: Map<String, Any> = emptyMap()) {}
}

fun formatCount(count: Int?): String = count?.toString() ?: "-"

fun String.slugify(): String = lowercase()
`;

/** Edge cases read off a real header: renames, boxing, collections, generics, one-line bodies. */
export const EDGE_CASES = `package dev.probe

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf

val version: Long = 1L
var counter: Int = 0
fun maybe(n: Int?, c: Char?, l: Long?, b: Boolean?): Double? = null
fun numbers(c: Char, s: Short, by: Byte, f: Float, u: UInt, ul: ULong): ULong = ul
fun lists(a: List<String>, b: List<Int>, c: Map<String, Int>, d: Set<Long>, e: MutableList<String>, f: MutableMap<String, String>, g: MutableSet<String>): List<Int?> = b
fun nullables(a: List<String?>, b: Map<String, String?>, c: Set<Int?>): List<String?> = a
fun arrays(a: ByteArray, b: IntArray, c: Array<String>): Array<Int> = arrayOf()
fun log(vararg parts: String) {}
fun callbacks(onDone: (Int) -> Unit, map: (String) -> Boolean, noArg: () -> String, maybe: ((String) -> Unit)?) {}
fun takesSuspend(block: suspend () -> Unit) {}
fun anyThings(a: Any, b: Any?): Any? = a
fun <T> firstOf(list: List<T>): T = list.first()
fun flow(): Flow<Int> = flowOf(1)
@Throws(IllegalStateException::class) fun risky(): Int = 1
suspend fun nothing() {}
fun neverReturns(): Nothing = throw IllegalStateException()
fun init() {}
fun initThing() {}
fun alloc() {}
fun allocate() {}
fun mutableCopy() {}
fun copyAll() {}
fun newsFeed() {}
fun String.shout(): String = uppercase()
fun Int.double(): Int = this * 2
fun List<String>.joined(): String = ""
val String.lastChar: Char get() = last()
typealias Id = String
fun byAlias(id: Id): Id = id

data class Point(val x: Int, val y: Int) {
    fun copy(scale: Int): Point = this
    var label: String = ""
    val isOrigin: Boolean get() = x == 0 && y == 0
}
fun Point.flip(): Point = Point(y, x)
val Point.sum: Int get() = x + y

enum class Mode { RED, DARK_GREEN, Blue, SOME_value }

sealed interface Event { data class Click(val x: Int) : Event; data object Close : Event }

interface Source<T> { fun next(): T; val size: Int; suspend fun load(id: String): String }

abstract class Base { abstract fun name(): String; open fun describe(): String = "" }
open class Animal(val legs: Int) { constructor() : this(4) }
class Box<T>(val value: T) { fun get(): T = value }
class NonNullBox<T : Any>(val value: T)
value class Token(val raw: String)
fun useToken(t: Token): Token = t
class Holder { class Nested(val n: Int); inner class Inner; companion object { fun make(): Holder = Holder() } }
class Weird { fun hash(): Int = 0; val description: String = ""; fun init(): Int = 0; var name: String = ""; lateinit var later: String }
class Defaults(val a: Int = 1, val b: String = "") { constructor(x: Double) : this(1, "") }
object Config { val url: String = ""; fun reset() {} }
internal fun hiddenInternal() {}
private class HiddenClass
`;
