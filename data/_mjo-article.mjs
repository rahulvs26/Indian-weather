/* v7.22x — the prose for section 2, the Madden–Julian Oscillation article.

   WHY THIS FILE EXISTS AND WHY THE PHASE NUMBERS ARE THE ONES IN data/mjo.json

   There are two common numberings for the eight MJO phases and they run in opposite directions.
   The Wheeler & Malanotte-Rossa RMM phase diagram (Monthly Weather Review 132, 2004) starts at
   the west Pacific; the Indian monsoon literature this deck already cites numbers from Africa,
   so phase 1 is over Africa and phase 5 is over the west Pacific.

   Both numberings are defensible. Two numberings in one deck is not, because the map's MJO popup
   prints "MJO Phase N" from data/mjo.json and a reader who then reads this article must not be
   given a different answer. So: THIS FILE USES data/mjo.json's ORDER, and says so on the page.
   The map layer and the article now agree, and the disagreement is documented rather than silent.

   The mechanism sentences below are written for the article. The per-phase India effect and the
   source string are NOT written here — they are read at runtime out of data/mjo.json, so the
   numbers on screen are the deck's own data and can be corrected in one place. */

export const MJO_PHASE_PROSE = {
  1: {
    mech: "The oscillation sits over Africa and the western Indian Ocean, freshly re-launched from " +
      "the land of the previous cycle. Convection over the continent is beginning to organise.",
    why: "The system has not yet reached the Indian Ocean, so there is little coherent organised " +
      "convection near the subcontinent to feed it.",
  },
  2: {
    mech: "The convective centre has moved into the west-central Indian Ocean. Warm water there " +
      "moistens the lower troposphere and the Rossby wave response is strengthening.",
    why: "An active southwest-monsoon build-up is under way; the Arabian Sea branch is filling in.",
  },
  3: {
    mech: "Convection is over the eastern Indian Ocean and Sumatra, near the Maritime Continent — " +
      "the warmest water on the planet at that time of year. This is the phase the monsoon literature " +
      "treats as most favourable.",
    why: "Organised convection is closest to the peninsula, which is when active monsoon pulses " +
      "over the southern peninsula occur.",
  },
  4: {
    mech: "The system has crossed the Maritime Continent. Upper-level divergence over the Indian Ocean " +
      "now settles the air there and flattens the monsoon trough.",
    why: "Rainfall over India is suppressed and the risk of a break begins to rise. This is the " +
      "turning point of the cycle for the subcontinent.",
  },
  5: {
    mech: "Convection is over the west Pacific, the far end of its journey. The Indian Ocean branch " +
      "of the Walker circulation is at its weakest.",
    why: "The strongest suppression of Indian rainfall in the whole cycle. Breaks in the monsoon " +
      "cluster in this phase more than any other.",
  },
  6: {
    mech: "The oscillation is in the central Pacific and is beginning to weaken; the cycle is past " +
      "its point of influence over the subcontinent.",
    why: "Weak influence over India. The classic July break is associated with the MJO sitting " +
      "east of India, which is where the system is in this phase.",
  },
  7: {
    mech: "The system is in the eastern Pacific and Atlantic, far from the Indian Ocean. It is " +
      "decaying or restarting, and there is no organised convection anywhere near India.",
    why: "Neutral-to-dry for the subcontinent. Before onset this is the window worth watching, " +
      "because a strong signal here is one of the levers on onset timing.",
  },
  8: {
    mech: "The cycle returns westward to the Atlantic and Africa, ready to begin again. Amplitude is " +
      "usually low by now unless the ocean is warm enough to sustain it.",
    why: "An onset-timing lever rather than a rainfall phase: a strong MJO in this phase six to " +
      "twelve months ahead modulates whether the following season leans El Niño or La Niña.",
  },
};

export const MJO_AMPLITUDE = [
  { min: 0.0, max: 1.0, label: "Damped / non-deterministic", note:
    "Below about 1.0 the signal is smaller than the noise. Forecasts at this amplitude are not " +
    "skilful, so a stated phase should be read as a possibility rather than a prediction." },
  { min: 1.0, max: 1.5, label: "Weak but detectable", note:
    "The oscillation is real but its effect on one district over one week is small. Useful as " +
    "context, not as a forecast." },
  { min: 1.5, max: 2.0, label: "Active", note:
    "A clearly coherent cycle. The phase matters at this amplitude." },
  { min: 2.0, max: 99, label: "Strongly active", note:
    "A large-amplitude, well-organised cycle. Suppression is severe in phases 4–6 and enhancement " +
    "in phase 3, so a strong signal is the one that carries real forecasting weight." },
];

export const MJO_FACTS = [
  { k: "Timescale", v: "Roughly 30 to 60 days for one full circuit of the eight phases" },
  { k: "Wavelength", v: "About 10,000–12,000 km — roughly the width of the equatorial Indo-Pacific belt" },
  { k: "Speed eastwards", v: "About 4–8 m/s over the warm oceans, slowing to a crawl over land" },
  { k: "Active in India", v: "Most active April–May (pre-monsoon) and October–November (retreat)" },
  { k: "What drives it", v: "Warm water moistens the lower troposphere; deep convection excites an " +
      "upper-level Rossby wave; the wave travels east and reinforces convection over the next warm pool" },
  { k: "What it is not", v: "Not the monsoon. The monsoon is the seasonal wind reversal from the " +
      "land–ocean heating contrast; the MJO is an intraseasonal wobble riding on top of it" },
];

export const MJO_SOURCES = [
  { t: "Pai 2011 — break spells of the Indian summer monsoon and the MJO (the source behind the " +
        "per-phase India notes in data/mjo.json)" },
  { t: "Wheeler & Malanotte-Rossa 2004, Monthly Weather Review 132 — the RMM phase-space method. Its " +
        "numbering runs opposite to this deck's; see the note on the card." },
  { t: "Madden & Julian 1972, Journal of the Atmospheric Sciences 29 — the original description" },
  { t: "IMD, Climate of India / Indian Monsoon — MJO chapter, imd.gov.in" },
  { t: "IIT Bombay CAS, monsoon onset and MJO research, cas.iitb.ac.in" },
  { t: "NOAA PSL and NOAA CPC — MJO resources and weekly amplitude updates, psl.noaa.gov / cpc.ncep.noaa.gov" },
];

export const MJO_CONVENTION_NOTE =
  "Phase numbering follows the Indian monsoon literature this deck cites (data/mjo.json), which runs " +
  "1 = Africa/W Indian Ocean through 5 = west Pacific. The Wheeler–Malanotte-Rossa RMM diagram numbers " +
  "the same eight positions in the opposite direction, with 1 in the west Pacific. Both are in use; " +
  "this article and the map layer above use the same one, so they cannot disagree.";

/* Positions on the phase-space circle. Schematic, laid out so the traversal runs left (Africa) around
   the top to the right (west Pacific), matching the numbering above. */
export const MJO_PHASE_POS = {
  1: [0.06, 0.50], 2: [0.24, 0.18], 3: [0.50, 0.06], 4: [0.76, 0.18],
  5: [0.94, 0.50], 6: [0.76, 0.82], 7: [0.50, 0.94], 8: [0.24, 0.82],
};

if (typeof window !== "undefined") {
  window.__MJO_PROSE = MJO_PHASE_PROSE;
  window.__MJO_POS = MJO_PHASE_POS;
  window.__MJO_AMPLITUDE = MJO_AMPLITUDE;
  window.__MJO_FACTS = MJO_FACTS;
  window.__MJO_SOURCES = MJO_SOURCES;
  window.__MJO_CONVENTION = MJO_CONVENTION_NOTE;
}