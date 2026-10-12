# Shape-File Integration Checklist (user data in `Shape files/`, 1.1 GB)
Goal: every user dataset visible in 3D + 2D map. Boxes ticked only after live browser proof.

## A. Reprojection (LCC → WGS84, pure Python)
- [x] LCC inverse implemented + validated vs dam lat/long fields (BWA max err 0.002°; Dam.shp 8/8 spot checks exact to 4 decimals; DAM.shp fields empty → shape-derived used)

## B. Extractions (`data/*.geo.json`, thinned for web)
- [x] basins (25 CWC basin polygons + area/states, 1.4MB) from KML (all 5 KMLs parsed; b1df file = dup Cauvery, skipped)
- [x] subbasins (98 CWC sub-basin polygons deduped from 121, 3.9MB) from KML
- [x] dams (13,002 pts from 13,365: Dam.shp + DAM.shp + BWA, explicit lat/longs, deduped, 2.9MB)
- [x] rivers-cwc (30,395 lines + names/basin/origin/ends, 14.6MB, background load)
- [x] glacial lakes (522 polys + elevation, 0.6MB)
- [x] reservoirs (5,162 polys hard-thinned, 2.3MB; slivers below thin threshold dropped)
- [x] riverbanks (1,032 major-polygon subset, 2.0MB)
- [x] TN waterbodies (1,771 polys incl. small tanks, 0.5MB; sub-threshold slivers dropped)

## C. Map wiring (2D Leaflet) — live-proven 2026-10-12 (photos + `layers on=11/13`, drill-down readout)
- [x] Basins chip (default ON) + click popup (area/states) + drill-down to sub-basins (Ganga→19 subs verified)
- [x] Rivers chip = CWC network (bg load, z>=6) + NE majors + origins + mouths + course arrows
- [x] Dams chip (ranked pins 40/400/all by zoom + popups: height/year/river)
- [x] Water chip (reservoirs + glacial lakes + TN waterbodies, on-demand; 267→7,722 paths verified)
- [x] Layer counts in self-test line
- [x] Zoom hierarchy (Google-Maps-style tiers) + smoothFactor + lazy/bg loads

## D. 3D terrain — live-proven (photos: walls + rivers + basins wash + sea plane)
- [x] Dams as wall models (top-250 tallest, one InstancedMesh; fixed TDZ crash caught live)
- [x] Rivers (46 labelled, tap-to-trace list, elevation-oriented packets)
- [x] Basins draped (25 washes + rims + name tags; fixed X/Z scope crash caught live)

## E. Proof — live-proven 2026-10-12
- [x] Live console clean + screenshots: basins drill-down readout / dams ranked / rivers CWC bg / water 7.7k paths / 3D dams+packets+sea
- [x] Spec + cache-bust bumped (v5.1)
