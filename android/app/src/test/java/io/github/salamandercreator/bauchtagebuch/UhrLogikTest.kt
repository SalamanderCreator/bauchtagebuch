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
            "uhrIds":["uhr-1795000000-1"],
            "speisen":[{"n":"Brötchen, Butter, Käse","k":270,"m":"1 Stück"},{"n":"Flammkuchen","k":820,"r":1,"ri":"hf-123"}]}"""
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

    @Test
    fun speiseVonDerUhrWieImScript() {
        val m = mapOf("id" to "uhr-1795001000-3", "d" to "2026-11-22", "z" to "12:30", "t" to "Flammkuchen",
            "a" to "e", "m" to "0,5 Portionen", "k" to 410, "ri" to "hf-123")
        val e = UhrLogik.eintragAusUhr(m, jetzt)!!
        assertEquals("essen", e.getString("typ"))
        assertEquals("0,5 Portionen", e.getString("menge"))
        assertEquals(410, e.getInt("kcal"))
        assertEquals("rezept", e.getString("kcalQuelle"))
        assertEquals("hf-123", e.getString("rezeptId"))
        assertFalse(e.has("ml"))
        val ohneRezept = UhrLogik.eintragAusUhr(m - "ri" + ("m" to "1 Stück"), jetzt)!!
        assertEquals("verlauf", ohneRezept.getString("kcalQuelle"))
        // Essen zählt zu kcal, nicht zu ml und nicht als letztes Getränk
        val w = UhrLogik.werte(basis(), listOf(e), heute)
        assertEquals(1010, w["kcal"])
        assertEquals(500, w["ml"])
        assertEquals("12:30", w["letzterDrink"])
    }

    @Test
    fun speisenWerdenDurchgereicht() {
        @Suppress("UNCHECKED_CAST") val s = UhrLogik.werte(basis(), emptyList(), heute)["speisen"] as List<Map<String, Any>>
        assertEquals(2, s.size)
        assertEquals(mapOf("n" to "Brötchen, Butter, Käse", "k" to 270, "m" to "1 Stück"), s[0])
        assertEquals(mapOf("n" to "Flammkuchen", "k" to 820, "r" to 1, "ri" to "hf-123"), s[1])
    }

    @Test
    fun grundumsatzWirdDurchgereicht() {
        assertEquals(0, UhrLogik.werte(basis(), emptyList(), heute)["grund"])
        assertEquals(1589, UhrLogik.werte(basis().put("grund", 1589), emptyList(), heute)["grund"])
        assertEquals(0, UhrLogik.werte(basis().put("grund", 300), emptyList(), heute)["grund"])
    }

    @Test
    fun gewichtNurBeiAenderungMelden() {
        assertFalse(UhrLogik.gewichtNeu(null, 64200))       // erster Wert: nichts melden
        assertFalse(UhrLogik.gewichtNeu(64200, 64200))
        assertTrue(UhrLogik.gewichtNeu(64200, 63900))
        assertNull(UhrLogik.gewicht(0))
        assertEquals(63900, UhrLogik.gewicht(63900))
    }

    @Test
    fun einstellungenNurBeiAnderemStand() {
        val b = basis().put("einst", JSONObject("""{"defizit":350,"g2kcal":0.3,"g1kcal":42,"g2name":"Cola","erinnerung":false}"""))
            .put("einstStand", 1795000000)
        val w = UhrLogik.werte(b, emptyList(), heute, null)
        @Suppress("UNCHECKED_CAST") val e = w["einst"] as Map<String, Any>
        assertEquals(350, e["defizit"])
        assertEquals(0.3, e["g2kcal"])
        assertEquals(42, e["g1kcal"])
        assertEquals(false, e["erinnerung"])
        assertEquals(1795000000, w["einstStand"])
        assertFalse(UhrLogik.werte(b, emptyList(), heute, 1795000000L).containsKey("einst"))
        assertTrue(UhrLogik.werte(b, emptyList(), heute, 1).containsKey("einst"))
        assertFalse(UhrLogik.werte(basis(), emptyList(), heute, null).containsKey("einst"))
    }
}
