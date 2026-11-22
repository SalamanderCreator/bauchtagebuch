package io.github.salamandercreator.bauchtagebuch

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class UhrLogikTest {

    private val heute = LocalDate.of(2026, 11, 22)
    private val jetzt = "2026-11-22T13:10:05.000Z"

    private fun basis() = JSONObject(
        """{"datum":"2026-11-22","kcal":600,"ml":500,"letzterDrink":"12:30","stand":1795000000,
            "woche":[{"d":"2026-11-16","k":null},{"d":"2026-11-17","k":1900},{"d":"2026-11-18","k":null},
                     {"d":"2026-11-19","k":null},{"d":"2026-11-20","k":1800},{"d":"2026-11-21","k":2100},
                     {"d":"2026-11-22","k":600}],
            "uhrIds":["uhr-1795000000-1"]}"""
    )

    private fun uhr(id: String, ml: Int = 330, k: Int = 139, z: String = "14:10", del: Int? = null): Map<String, Any> {
        val m = mutableMapOf<String, Any>("id" to id, "d" to "2026-11-22", "z" to z, "t" to "Cola", "ml" to ml, "k" to k)
        if (del != null) m["del"] = del
        return m
    }

    @Test
    fun eintragWieImScript() {
        val e = UhrLogik.eintragAusUhr(uhr("uhr-1795001000-7"), jetzt)!!
        assertEquals("trinken", e.getString("typ"))
        assertEquals("330 ml", e.getString("menge"))
        assertEquals(330, e.getInt("ml"))
        assertEquals(139, e.getInt("kcal"))
        assertEquals("eigene", e.getString("kcalQuelle"))
        assertEquals("über Uhr", e.getString("notiz"))
        assertEquals(jetzt, e.getString("geaendert"))
        assertFalse(UhrLogik.istGeloescht(e))
        assertNull(UhrLogik.eintragAusUhr(uhr("boese-id"), jetzt))
        assertNull(UhrLogik.eintragAusUhr(uhr("uhr-1795001000-8", ml = 0), jetzt))
        // Löschauftrag ohne lesbare Daten: kurzer Vermerk
        val weg = UhrLogik.eintragAusUhr(mapOf("id" to "uhr-1795001000-9", "del" to 1), jetzt)!!
        assertTrue(UhrLogik.istGeloescht(weg))
        assertFalse(weg.has("kcal"))
    }

    @Test
    fun werteMitNochNichtUebernommenenEintraegen() {
        val neu = UhrLogik.eintragAusUhr(uhr("uhr-1795001000-7"), jetzt)!!
        val w = UhrLogik.werte(basis(), listOf(neu), heute)
        assertEquals("2026-11-22", w["datum"])
        assertEquals(739, w["kcal"])
        assertEquals(830, w["ml"])
        assertEquals("14:10", w["letzterDrink"])
        assertEquals(UhrLogik.isoSekunden(jetzt).toInt(), w["stand"])
        @Suppress("UNCHECKED_CAST") val woche = w["woche"] as List<Map<String, Any>>
        assertEquals(7, woche.size)
        assertEquals(mapOf("d" to "2026-11-16"), woche[0])          // null-Tage ohne "k"
        assertEquals(mapOf("d" to "2026-11-22", "k" to 739), woche[6])
    }

    @Test
    fun schonEnthaltenNichtDoppeltUndLoeschenZiehtAb() {
        val drin = UhrLogik.eintragAusUhr(uhr("uhr-1795000000-1", ml = 250, k = 0), jetzt)!!
        assertEquals(600, UhrLogik.werte(basis(), listOf(drin), heute)["kcal"])
        val weg = UhrLogik.eintragAusUhr(uhr("uhr-1795000000-1", ml = 250, k = 100, del = 1), jetzt)!!
        val w = UhrLogik.werte(basis(), listOf(weg), heute)
        assertEquals(500, w["kcal"])
        assertEquals(250, w["ml"])
        // gelöscht, aber nie gezählt: nichts abziehen
        val nie = UhrLogik.eintragAusUhr(uhr("uhr-1795009999-1", del = 1), jetzt)!!
        assertEquals(600, UhrLogik.werte(basis(), listOf(nie), heute)["kcal"])
    }

    @Test
    fun grundlageVonGesternWirdAufHeuteUmgerechnet() {
        val w = UhrLogik.werte(basis(), emptyList(), heute.plusDays(1))
        assertEquals("2026-11-23", w["datum"])
        assertEquals(0, w["kcal"])
        assertEquals(0, w["ml"])
        assertFalse(w.containsKey("letzterDrink"))
        @Suppress("UNCHECKED_CAST") val woche = w["woche"] as List<Map<String, Any>>
        assertEquals(mapOf("d" to "2026-11-22", "k" to 600), woche[5])
        assertEquals(mapOf("d" to "2026-11-23"), woche[6])
    }
}
