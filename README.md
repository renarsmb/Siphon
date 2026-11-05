# Dayline

Latvisks mobilais plānotājs ar nedēļas laika joslu, V1–V4 prioritātēm, organizācijām un privātām biļeteņu sarakstēm. HTML, CSS un JavaScript; nav būvēšanas soļa.

## Ieslēgšana

1. Supabase SQL Editorā palaid visu `collaboration.sql`. Tas ietver arī sākotnējo shēmu un saglabā jau esošos plānus. `schema.sql` satur to pašu aktuālo iestatīšanas kodu; pietiek palaist vienu no abiem failiem. Iepriekšējais `timeline-migration.sql` vairs nav vajadzīgs.
2. Esošo `config.js` saglabā. Tajā vajadzīga tikai Supabase projekta URL un publishable/anon atslēga. Nekad neievieto `service_role`, secret key vai datubāzes paroli.
3. Supabase Authentication → URL Configuration: Site URL un Redirect URLs jāietver precīza adrese `https://renarsmb.github.io/Siphon/`.
4. GitHub Pages publicē `master` zara sakni. Pēc atjauninājuma pārlādē lapu. Konti izmanto e-pastu un paroli; ja ieslēgta e-pasta apstiprināšana, vispirms apstiprini savu adresi.
5. Iestatījumos saglabā savu vārdu un pēc izvēles profila bildes HTTPS adresi. Izveido organizāciju. Darba telpas izvēlnē augšā vari pārslēgt personīgos un organizācijas plānus.
6. Organizācijas administrators Iestatījumos izveido vienreizēju uzaicinājuma kodu ar vajadzīgo lomu. Pats nodod kodu saņēmējam; automātiski e-pasti netiek sūtīti. Saņēmējs pieslēdzas un ievada kodu Iestatījumos. Kods derīgs 7 dienas un izmantojams vienreiz; to var atsaukt.

## Laika josla

- V1 ir augstākā prioritāte, V4 — zemākā. Krāsu, sākumu, beigas, dalībnieku nosaukumus, statusu un svarīguma atzīmi var mainīt plāna formā.
- Datorā velc bloku. Telefonā turi aptuveni 350 ms un velc. Sānu malas maina sākumu/beigas; laika solis ir 30 minūtes. Tos pašus laukus var mainīt arī formā.
- Pēc pārvietošanas izvēlies: paturēt esošo laiku, tuvāko brīvo laiku vai citu laiku. Brīvais laiks tiek meklēts izvēlētās nedēļas robežās tajā pašā prioritātes joslā, saglabājot ilgumu. Pabeigtie un atliktie plāni neaizņem brīvā laika meklētāju.
- Ghost bloks ir nesaglabāts priekšskatījums. Tikai **Saglabāt** maina datus. **Atcelt** atjauno iepriekšējo versiju.
- Organizācijas plāna formā izvēlēti dalībnieki piešķir viesiem piekļuvi. Atsevišķais dalībnieku nosaukumu lauks ir apraksta teksts un pats par sevi nemaina piekļuvi.
- Rediģēšanas kontūra, sinhronizācijas simbols un profils tiek atjaunoti aptuveni ik pēc 5 sekundēm. Pārtraukta sesija izdziest 30 sekundēs. Tas ir informatīvs statuss, nevis ekskluzīvs bloķējums.
- Vienlaicīgas saglabāšanas un veca apstiprinājuma gadījumā datubāze pārbauda versiju un noraida pārrakstīšanu.

## Piekļuves

| Loma | Plāni | Organizācijas pārvaldība |
| --- | --- | --- |
| Administrators | Redz un rediģē organizācijas plānus; saņem un izlemj sev adresētas biļetenes | Uzaicinājumi, lomas un dalībnieku noņemšana |
| Piederīgais | Redz organizācijas plānus; veido un rediģē savus; var iesniegt izmaiņas apstiprināšanai | Nav |
| Viesis | Redz tikai viņam piešķirtos plānus; var iesniegt izmaiņu pieprasījumu | Nav |

Īpašnieks ir administrators; viņa lomu un dalību no šīs saskarnes nevar noņemt. Personīgie plāni paliek privāti arī pēc organizācijas izveides. Organizācijas sarakstes redz tikai konkrētais iesniedzējs un saņēmējs, kamēr viņi ir dalībnieki. Citi administratori šīs sarakstes neredz.

## Biļetenes

Organizācijā atver **Biļetenes → Jauna**, izvēlies administratoru, pēc izvēles piesaisti plānu un iesniedz aprakstu. Lai iesniegtu konkrētas plāna izmaiņas, tās sagatavo plāna formā un spied **Iesniegt apstiprināšanai**. Pēc apstiprināšanas tās piemērojas plānam vienā datubāzes transakcijā; noraidīšana plānu nemaina.

Sarakstē var pievienot līdz 5 PDF, DOCX, PNG, JPG vai TXT failiem, katru līdz 10 MB. Tie glabājas privātā Supabase Storage bucket. Lejupielādes saites ir īslaicīgas. Ziņas un faili netiek glabāti servisa darbinieka kešā.

## Vietējais un bezsaistes režīms

Bez pieslēgšanās personīgie plāni glabājas šajā pārlūkā. Vietējie plāni netiek automātiski importēti kontā; pēc izrakstīšanās tie atkal ir redzami. Mākoņa darbībām un organizāciju sarakstēm nepieciešams internets. Lietotnes faili, Google ikonu fonti un Supabase SDK tiek kešoti pēc pirmās veiksmīgās ielādes. Jauna pārlūka pirmā atvēršana prasa internetu.

## Pārbaudes

- `node --check app.js` un `node --check sw.js` pārbauda sintaksi.
- `node timeline.test.js` pārbauda datumus, DST, vairāku dienu diapazonus, brīvo laiku un datu nemainīšanu pirms saglabāšanas.
- `tests/access.sql` ir transakcijā atcelta PostgreSQL integrācijas pārbaude atsevišķai testa sesijai pēc shēmas uzstādīšanas. Tā pārbauda administratora, piederīgā, viesa un nepiederīga konta piekļuvi, uzaicinājumus un apstiprināšanu. Tā šajā izstrādes vidē nav izpildīta, jo nav piekļuves PostgreSQL/Supabase administrēšanai.
- Lokālajā pārlūkā pārbaudīta izveide, pārlāde, V1→V2 vilkšana, laika izvēle, ghost priekšskatījums, atcelšana un saglabāšana. Čata ziņas, lēmuma darbības un iestatījumu saskarne pārbaudīta izolētā atmiņas testā; tas neaizstāj dzīvas datubāzes RLS pārbaudi.
- Pēc shēmas palaišanas pārbaudi ar diviem reāliem kontiem: uzaicināšanu, piešķirtu viesa piekļuvi, ziņu un faila nosūtīšanu, apstiprināšanu un profila rediģēšanas indikatoru.
