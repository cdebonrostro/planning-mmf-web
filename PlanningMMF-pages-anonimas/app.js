import { schedule, restSources, shift } from "./engine.js";
import { readWorkspace, writeWorkspace } from "./storage.js";
const names = Array.from({ length: 8 }, (_, i) => "P0" + (i + 1)),
  ds = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
  ],
  statuses = [
    "Disponible",
    "Guardia",
    "Libranza",
    "Vacaciones",
    "Baja",
    "Permiso",
    "Congreso/curso",
    "Congreso",
    "Curso",
    "Comité",
    "Juicio",
    "Despacho",
    "Otro compromiso",
  ];
const $ = (id) => document.getElementById(id);
$("days").innerHTML =
  '<div class="daygrid">' +
  ds
    .slice(0, 5)
    .map(
      (d, i) =>
        `<div class="daybox"><b>${d}</b>${[
          ["holiday", "Festivo"],
          ["holidayOverride", "Mantener actividad en festivo"],
          ["CME San José", "CME San José"],
          ["CME Ramón y Cajal", "CME Ramón y Cajal"],
          ["close", "Cierre Grande Covián"],
        ]
          .map(
            ([k, l]) =>
              `<input type="checkbox" id="${k}${i}"><label for="${k}${i}">${l}</label>`,
          )
          .join(
            "",
          )}<input type="hidden" id="eve${i}" value="0"><div id="eve${i}Buttons" class="choices"></div></div>`,
    )
    .join("") +
  "</div>";
$("avail").innerHTML =
  "<table><tr><th>Facultativo</th>" +
  ds.map((d) => "<th>" + d + "</th>").join("") +
  "</tr>" +
  names
    .map(
      (n, i) =>
        "<tr><th>" +
        `<span data-profile-label="${i}">${n}</span>` +
        "</th>" +
        ds
          .map(
            (d, j) =>
              `<td><input type="hidden" id="s${i}_${j}" value="${i === 7 ? "Baja" : "Disponible"}"><button type="button" class="status" data-status="s${i}_${j}">${i === 7 ? "Baja" : "Disponible"}</button><input type="hidden" id="jd${i}_${j}" value="0"><input type="hidden" id="ae${i}_${j}" value="0"><div class="mini">${[0, 3].includes(i) || j !== 3 ? "" : `<button type="button" data-jd="${i}_${j}">JD</button>`}<input type="hidden" id="override${i}_${j}" value="0"><input type="hidden" id="reason${i}_${j}"><input type="hidden" id="committee${i}_${j}" value="0">${[0, 5, 7].includes(i) ? "" : `<button type="button" data-ae="${i}_${j}">AE 0</button>`}</div></td>`,
          )
          .join("") +
        "</tr>",
    )
    .join("") +
  "</table>";
$("previous").innerHTML =
  "<p><b>Guardias del fin de semana anterior</b></p>" +
  names
    .map(
      (n, i) =>
        `<span style="display:inline-block;margin:5px"><span data-profile-label="${i}">${n}</span> <label><input type="checkbox" id="prevS${i}"> S</label> <label><input type="checkbox" id="prevD${i}"> D</label></span>`,
    )
    .join("");
const activities = [
  "Planta",
  "Consulta 4",
  "Consulta 5",
  "Grande Covián",
  "Versiones",
  "Eco 3D",
  "MARECU",
  "Q obstétrico",
  "Q ginecológico",
  "Histeroscopias",
  "Despacho",
];
const general = [
  "Planta",
  "Consulta 4",
  "Consulta 5",
  "Grande Covián",
  "Q obstétrico",
];
const defaults = [
  ["Versiones", "Q obstétrico"],
  general,
  [
    "Planta",
    "Consulta 4",
    "Consulta 5",
    "Versiones",
    "Eco 3D",
    "MARECU",
    "Q obstétrico",
    "Despacho",
  ],
  ["Consulta 4", "Consulta 5", "Grande Covián", "Q obstétrico"],
  [...general, "MARECU", "Eco 3D", "Histeroscopias"],
  general,
  general,
  general,
];
const aeAllowed = (i) => [1, 2, 3, 4, 6].includes(i);
const jdAllowed = (i) => ![0, 3].includes(i);
let result = [],
  required = [],
  afternoons = [],
  cursorEnd = 0,
  autoPerson = -1;
let locks = new Map();
let workspace = {},
  revision = 0,
  pending = false,
  ready = false,
  conflict = false;
let epoch = 0,
  openWeek;
const planPrefix = "mmf-plan-";
const read = (key) => workspace[key] ?? null;
const profile = (i) => workspace["mmf-profiles"]?.[names[i]] || names[i];
const profileForId = (id) => profile(names.indexOf(id)) || id;
const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
$("profiles").innerHTML = names
  .map(
    (id, i) =>
      `<label>${id} <input data-profile="${i}" type="text" maxlength="70" autocomplete="off" placeholder="${id}"></label>`,
  )
  .join("");
function refreshProfiles() {
  for (const label of document.querySelectorAll("[data-profile-label]")) {
    label.textContent = profile(Number(label.dataset.profileLabel));
  }
  for (const input of document.querySelectorAll("[data-profile]")) {
    input.value =
      workspace["mmf-profiles"]?.[names[Number(input.dataset.profile)]] || "";
  }
  updatePlanningLabels();
  refreshButtons();
}
function updatePlanningLabels() {
  document
    .querySelectorAll(".planning [data-profile-label]")
    .forEach((label) => {
      label.textContent = profile(Number(label.dataset.profileLabel));
    });
  delete $("viewItem").dataset.mode;
  applyView();
}
const dateParts = Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .map((part) => [part.type, part.value]),
);
const today = [dateParts.year, dateParts.month, dateParts.day].join("-");
const monday = shift(
  today,
  -((new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7),
);
$("week").value = monday;
$("week").required = true;
$("hystDays").innerHTML = ds
  .slice(0, 5)
  .map(
    (day, d) => `<label><input type="checkbox" id="hyst${d}"> ${day}</label>`,
  )
  .join("");
$("skills").innerHTML =
  "<table><tr><th>Facultativo</th><th>Activo</th>" +
  activities.map((task) => `<th>${task}</th>`).join("") +
  "</tr>" +
  names
    .map(
      (name, i) =>
        `<tr><th><span data-profile-label="${i}">${name}</span></th><td><input aria-label="Activo ${name}" id="active${i}" type="checkbox" ${i === 7 ? "" : "checked"}></td>` +
        activities
          .map(
            (task, t) =>
              `<td><input aria-label="${name} ${task}" id="skill${i}_${t}" type="checkbox" ${defaults[i].includes(task) ? "checked" : ""} ${hardSkill(i, task) ? "" : "disabled"}></td>`,
          )
          .join("") +
        "</tr>",
    )
    .join("") +
  "</table>";

function hardSkill(i, task) {
  if (i === 0) return defaults[0].includes(task);
  if (task === "Planta") return i !== 3;
  if (task === "Grande Covián") return i !== 2;
  if (task === "MARECU" || task === "Eco 3D") return [2, 4].includes(i);
  if (task === "Versiones" || task === "Despacho") return i === 2;
  return true;
}
function checkedSkill(i, task) {
  return (
    hardSkill(i, task) &&
    $("skill" + i + "_" + activities.indexOf(task))?.checked
  );
}
function hasJD(i, d) {
  return d === 3 && jdAllowed(i) && autoPerson === i;
}
function autoRest(i, d) {
  const week = $("week").value;
  if (!week) return false;
  return restSources(shift(week, d)).some((date) => {
    const offset = Math.round((Date.parse(date) - Date.parse(week)) / 86400000);
    if (offset >= 0) return $("s" + i + "_" + offset).value === "Guardia";
    const previous =
      workspace["mmf-draft"]?.[shift(week, -7)]?.config ??
      workspace[planPrefix + shift(week, -7)]?.config;
    return Boolean(
      $(offset === -2 ? "prevS" + i : "prevD" + i).checked ||
        previous?.["s" + i + "_" + (7 + offset)] === "Guardia",
    );
  });
}
function status(i, d) {
  const raw = $("s" + i + "_" + d).value;
  if (!$("active" + i).checked) return "Inactivo";
  if (
    autoRest(i, d) &&
    !(
      $("override" + i + "_" + d).value === "1" &&
      $("reason" + i + "_" + d).value
    ) &&
    ["Disponible", "Guardia"].includes(raw)
  )
    return "Libranza";
  return hasJD(i, d) && raw === "Disponible" ? "Jornada deslizada" : raw;
}
function eligible(i, task, d) {
  return (
    !hasJD(i, d) &&
    checkedSkill(i, task === "Planta 2" ? "Planta" : task) &&
    (["Disponible", "Guardia"].includes(status(i, d)) ||
      (status(i, d) === "Comité" &&
        i === 2 &&
        task === "Planta" &&
        $("committee" + i + "_" + d).value === "1")) &&
    (task !== "Q ginecológico" || names[i] === $("gyn").value)
  );
}
function toggleJD(key) {
  const input = $("jd" + key);
  const next = input.value !== "1";
  for (let i = 0; i < names.length; i++) $("jd" + i + "_3").value = "0";
  input.value = next ? "1" : "0";
  refreshButtons();
  queueDraft();
}
function toggleAE(key) {
  const input = $("ae" + key);
  const count = Number(input.value);
  if (
    count === 1 &&
    !confirm("¿Confirmas que las dos sesiones AE son compatibles?")
  )
    return;
  input.value = String((count + 1) % 3);
  refreshButtons();
  queueDraft();
}
function closedHoliday(d) {
  return d < 5 && $("holiday" + d).checked && !$("holidayOverride" + d).checked;
}
function generate() {
  const week = $("week").value;
  if (!week || new Date(week + "T00:00:00Z").getUTCDay() !== 1)
    return notify("Selecciona un lunes.");
  autoPerson = -1;
  for (const cell of document.querySelectorAll("[data-lock]:checked")) {
    locks.set(cell.dataset.lock, $("r" + cell.dataset.lock).innerText);
  }
  const people = names.map((_, i) => ({
    active: $("active" + i).checked,
    skills: activities.filter((task) => checkedSkill(i, task)),
    ae: aeAllowed(i),
    jd: jdAllowed(i),
    history: historyCounts(i, week),
  }));
  const days = ds.map((_, d) => {
    const tasks = [];
    if (d < 5 && !closedHoliday(d)) {
      tasks.push(
        "Planta",
        d === 3 && $("pgr").checked ? "MARECU" : "Consulta 4",
        "Consulta 5",
      );
      if ([0, 2, 4].includes(d)) tasks.push("Q obstétrico");
      if ($("hyst" + d).checked) tasks.push("Histeroscopias");
      if (d === 2 && $("gyn").value !== "Nadie") tasks.push("Q ginecológico");
      if (!$("close" + d).checked) tasks.push("Grande Covián");
      if ([1, 3].includes(d)) tasks.push("Versiones", "Eco 3D");
    }
    return {
      tasks,
      status: names.map((_, i) => status(i, d)),
      gyn: names.indexOf($("gyn").value),
      committee: names.map(
        (_, i) => $("committee" + i + "_" + d).value === "1",
      ),
      locks: names.map((_, i) => locks.get(i + "_" + d)),
      jd: names
        .map((_, i) => i)
        .filter((i) => $("jd" + i + "_" + d).value === "1"),
      ae: names.map((_, i) =>
        tasks.length ? Number($("ae" + i + "_" + d).value) : 0,
      ),
      doubleAE: names.map((_, i) => $("ae" + i + "_" + d).value === "2"),
      evenings: tasks.length ? Number($("eve" + d).value) : 0,
    };
  });
  const rotation = [
    ...new Set(
      $("rotation")
        .value.split(",")
        .map((name) => names.indexOf(name.trim()))
        .filter(aeAllowed),
    ),
  ];
  const plan = schedule({
    people,
    days,
    rotation,
    combine: $("combine").checked,
    office: $("office").checked,
    autoJD: $("autoJD").checked,
    jdRotation: $("jdRotation")
      .value.split(",")
      .map((name) => names.indexOf(name.trim()))
      .filter((i) => i >= 0 && jdAllowed(i)),
    hospital: $("nocme").value,
    cursor: Number($("cursor").value) || 0,
  });
  ({ result, required } = plan);
  autoPerson = plan.jd;
  afternoons = plan.afternoons.map((day) =>
    day.map((i) => names[i] || "SIN COBERTURA"),
  );
  cursorEnd = plan.cursor;
  $("nextcursor").textContent =
    "Siguiente posición de rotación: " + (cursorEnd + 1);
  render();
  for (const [key, value] of locks) $("r" + key).innerText = value;
  validate();
  for (const { day, person, reason } of plan.skipped) {
    const item = document.createElement("p");
    item.textContent =
      ds[day] + " · Turno AE omitido: " + profile(person) + " (" + reason + ")";
    $("alerts").append(item);
  }
  refreshButtons();
  queueDraft();
}
function historyCounts(i, week) {
  const counts = {};
  for (const [key, value] of Object.entries(workspace)) {
    if (!key.startsWith(planPrefix) || key.slice(planPrefix.length) >= week)
      continue;
    for (const day of value.result)
      for (const task of day[i]) counts[task] = (counts[task] || 0) + 1;
    if (value.autoPerson === i) counts.JD = (counts.JD || 0) + 1;
  }
  return counts;
}
function restoreLocks() {
  document.querySelectorAll("[data-lock]").forEach((box) => {
    box.checked = locks.has(box.dataset.lock);
  });
}
function applyView() {
  const value = $("view").value;
  const item = $("viewItem");
  const table = $("out").querySelector("table");
  if (!table) return;
  item.hidden = value === "week";
  $("viewLabel").textContent =
    value === "day" ? "Día" : value === "person" ? "Facultativo" : "";
  if (item.dataset.mode !== value) {
    item.dataset.mode = value;
    item.replaceChildren(
      ...(value === "day"
        ? ds
        : value === "person"
          ? names.map((_, i) => profile(i))
          : []
      ).map((label, i) => new Option(label, i)),
    );
  }
  table.toggleAttribute("data-filter", value !== "week");
  [...table.rows].forEach((row, i) => {
    row.hidden = value === "person" && i !== 0 && i !== Number(item.value) + 1;
    [...row.cells].forEach((cell, d) => {
      cell.hidden = value === "day" && d !== 0 && d !== Number(item.value) + 1;
    });
  });
}

function render() {
  let monday = $("week").value;
  $("out").innerHTML =
    '<table class="planning"><tr><th>Facultativo</th>' +
    ds
      .map((x, d) => {
        let dt = new Date(monday + "T12:00:00");
        dt.setDate(dt.getDate() + d);
        return (
          "<th>" +
          x +
          "<br>" +
          dt.getDate() +
          "/" +
          (dt.getMonth() + 1) +
          "</th>"
        );
      })
      .join("") +
    "</tr>" +
    names
      .map(
        (n, i) =>
          "<tr><th>" +
          `<span data-profile-label="${i}">${escapeHtml(profile(i))}</span>` +
          "</th>" +
          ds
            .map((_, d) => {
              let st = status(i, d),
                raw = $(`s${i}_${d}`).value,
                jd = hasJD(i, d),
                ae = Array.isArray(afternoons[d])
                  ? afternoons[d].filter((x) => x === n).length
                  : afternoons[d] === n
                    ? 1
                    : 0;
              let tasks = result[d][i].map((t) =>
                t === "Planta 2" ? "Planta" : t,
              );
              if (st === "Comité") tasks.push("Comité");
              let am =
                d >= 5
                  ? ""
                  : closedHoliday(d)
                    ? "Festivo"
                    : tasks.join(" / ") ||
                      (st === "Disponible"
                        ? i === 0
                          ? "Despacho"
                          : "Sin asignar"
                        : st === "Jornada deslizada"
                          ? ""
                          : st);
              if (d >= 5 && !["Disponible", "Guardia"].includes(st)) am = st;
              if (raw === "Guardia" && !am.includes("Guardia"))
                am += (am ? " / " : "") + "Guardia";
              let cls = am.includes("Planta")
                ? "plant"
                : am.includes("Consulta") || am.includes("MARECU")
                  ? "consult"
                  : am.includes("Q ") || am.includes("Histeroscopias")
                    ? "qx"
                    : am.includes("Grande Covián")
                      ? "cme"
                      : "neutral";
              return `<td class="${cls}"><div contenteditable="plaintext-only" id="r${i}_${d}">${am}</div><label class="lock controls"><input type="checkbox" data-lock="${i}_${d}"> Bloquear</label><div class="pm">${jd ? '<span class="jd">JD</span>' : ""}${ae ? '<span class="ae">AE' + (ae > 1 ? " ×" + ae : "") + "</span>" : ""}</div></td>`;
            })
            .join("") +
          "</tr>",
      )
      .join("") +
    "</table><p><small>JD = jornada deslizada · AE = actividad extraordinaria. Las tardes se editan en disponibilidad.</small></p>";
  restoreLocks();
  recolor();
  validate();
  applyView();
}
function validate() {
  if (!result.length) {
    notify("Genera o recupera un planning primero.");
    return;
  }
  recolor();
  let alerts = [];
  for (let i = 0; i < names.length; i++)
    for (let d = 0; d < 5; d++)
      if (autoRest(i, d) && +$(`override${i}_${d}`).value)
        alerts.push(
          ds[d] + ": libranza anulada excepcionalmente — " + profile(i),
        );
  for (let d = 0; d < 5; d++) {
    if (closedHoliday(d)) continue;
    let cells = names.map((_, i) =>
      ($(`r${i}_${d}`).innerText || "").split("/").map((s) => s.trim()),
    );
    for (let t of required[d]) {
      let ids = names.map((_, i) => i).filter((i) => cells[i].includes(t));
      if (t === "Planta" ? ids.length < 1 : ids.length !== 1)
        alerts.push(
          ds[d] +
            ": " +
            t +
            " — " +
            (ids.length ? "duplicada" : "sin cobertura"),
        );
    }
    for (let i = 0; i < names.length; i++) {
      const a = cells[i].filter((t) => activities.includes(t));
      for (const task of a) {
        if (task === "Despacho" && i === 0 && status(i, d) === "Disponible")
          continue;
        if (!eligible(i, task, d))
          alerts.push(
            ds[d] +
              ": " +
              profile(i) +
              " sin habilitación o disponibilidad para " +
              task,
          );
      }
      if (
        a.includes("Planta") &&
        a.includes("Despacho") &&
        !cells.some((row, j) => j !== i && row.includes("Planta"))
      ) {
        alerts.push(
          ds[d] + ": el único responsable de planta no puede cubrir despacho.",
        );
      }
      if (status(i, d) === "Comité" && a.includes("Planta")) {
        alerts.push(
          ds[d] +
            ": confirma que queda tiempo protegido para el comité de " +
            profile(i) +
            ".",
        );
      }
      if (
        a.length > 1 &&
        !(
          i === 4 &&
          a.length === 2 &&
          a.includes("Histeroscopias") &&
          a.includes("Q obstétrico")
        ) &&
        !(
          a.length === 2 &&
          i === 2 &&
          a.includes("Despacho") &&
          a.some((t) => ["Planta", "Eco 3D"].includes(t))
        ) &&
        !(
          a.length === 2 &&
          a.includes("Planta") &&
          a.some((t) => ["Eco 3D", "Versiones", "Q obstétrico"].includes(t)) &&
          $("combine").checked
        )
      )
        alerts.push(ds[d] + ": posible colisión de " + profile(i));
      if (a.includes("Planta") && a.length > 1)
        alerts.push(
          ds[d] +
            ": " +
            profile(i) +
            " comparte planta con " +
            a.filter((t) => t !== "Planta").join(", ") +
            ", revisar cobertura efectiva",
        );
      if (i === 3 && a.some((t) => ["Planta", "Planta 2"].includes(t)))
        alerts.push(ds[d] + ": " + profile(i) + " no puede cubrir planta");
    }
    if (
      required[d].includes("Planta") &&
      cells.filter(
        (row) =>
          row.includes("Planta") &&
          !row.some((task) =>
            ["Versiones", "Eco 3D", "Q obstétrico", "Comité"].includes(task),
          ),
      ).length < 2
    )
      alerts.push(ds[d] + ": sin segundo facultativo de planta");
    for (let i = 0; i < names.length; i++) {
      let jd = hasJD(i, d),
        ae = +$(`ae${i}_${d}`).value,
        st = status(i, d);
      if ((jd || ae) && !["Disponible", "Jornada deslizada"].includes(st))
        alerts.push(ds[d] + ": revisar tarde de " + profile(i) + " por " + st);
    }
    if (
      d === 3 &&
      ($("autoJD").checked ||
        names.some((_, i) => $(`jd${i}_3`).value === "1")) &&
      !names.some((_, i) => hasJD(i, d))
    )
      alerts.push("Jueves: jornada deslizada sin cobertura");
    if (
      (Array.isArray(afternoons[d]) ? afternoons[d] : [afternoons[d]]).includes(
        "SIN COBERTURA",
      )
    )
      alerts.push(ds[d] + ": actividad extraordinaria sin cobertura");
  }
  $("alerts").innerHTML =
    "<h3>Revisión de cobertura</h3>" +
    (alerts.length
      ? alerts
          .map((a) => '<p class="warn">• ' + escapeHtml(a) + "</p>")
          .join("")
      : "<p>Sin incidencias detectadas por las reglas actuales.</p>");
}
function csv(share = false) {
  if (!result.length) {
    notify("Genera o recupera un planning primero.");
    return;
  }
  let rows = [
    ["Facultativo", ...ds],
    ...names.map((_, i) => [
      profile(i),
      ...ds.map(
        (_, d) =>
          $(`r${i}_${d}`).innerText +
          " " +
          $(`r${i}_${d}`).parentElement.querySelector(".pm").innerText,
      ),
    ]),
    [
      "AE asignada",
      ...afternoons.map((a) =>
        Array.isArray(a) ? a.map(profileForId).join(" / ") : profileForId(a),
      ),
    ],
  ];
  const file = new File(
    [
      "\ufeff" +
        rows
          .map((r) =>
            r
              .map(
                (x) =>
                  '"' +
                  (/^\s*[=+@-]/.test(x) ? "'" + x : x).replaceAll('"', '""') +
                  '"',
              )
              .join(";"),
          )
          .join("\n"),
    ],
    "Planning_MMF_" + $("week").value + ".csv",
    { type: "text/csv;charset=utf-8" },
  );
  shareOrDownload(file, share);
  notify("CSV preparado.");
}

function choices(id, items) {
  let root = $(id + "Buttons");
  root.replaceChildren();
  for (const [value, label] of items) {
    let b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.className = $(id).value === value ? "active" : "";
    b.setAttribute("aria-pressed", String($(id).value === value));
    b.onclick = () => {
      $(id).value = value;
      refreshButtons();
      queueDraft();
    };
    root.append(b);
  }
}
function refreshButtons() {
  for (let d = 0; d < 5; d++)
    choices("eve" + d, [
      ["0", "Sin AE"],
      ["1", "1 AE"],
      ["2", "2 AE"],
    ]);
  choices("gyn", [
    ["Nadie", "Sin quirófano"],
    ...names.slice(1).map((n, i) => [n, profile(i + 1)]),
  ]);
  choices("nocme", [
    ["auto", "Automático"],
    ...ds.slice(0, 5).map((d, i) => [String(i), d]),
  ]);
  document
    .querySelectorAll("[data-jd]")
    .forEach((b) =>
      b.classList.toggle(
        "active",
        $("jd" + b.dataset.jd).value === "1" ||
          hasJD(...b.dataset.jd.split("_").map(Number)),
      ),
    );
  document.querySelectorAll("[data-ae]").forEach((b) => {
    let v = +$("ae" + b.dataset.ae).value;
    b.textContent = "AE " + v;
    b.classList.toggle("active", v > 0);
  });
  document.querySelectorAll("[data-status]").forEach((b) => {
    let v = $(b.dataset.status).value;
    let [i, d] = b.dataset.status.slice(1).split("_").map(Number);
    b.textContent = status(i, d);
    b.classList.toggle("changed", status(i, d) !== "Disponible");
  });
}
document.querySelectorAll("[data-status]").forEach((b) => {
  b.onclick = () => {
    let id = b.dataset.status;
    let [i, d] = id.slice(1).split("_").map(Number);
    $("statusTitle").textContent =
      profile(i) +
      " · " +
      ds[d] +
      (autoRest(i, d) ? " · Libranza automática (Disponible = excepción)" : "");
    let root = $("statusButtons");
    root.replaceChildren();
    for (const v of statuses) {
      let x = document.createElement("button");
      x.type = "button";
      x.textContent = v;
      x.className = $(id).value === v ? "active" : "";
      x.onclick = () => {
        if (autoRest(i, d) && v === "Disponible") {
          const reason = prompt("Motivo de la excepción de libranza");
          if (!reason?.trim()) return;
          $(`reason${i}_${d}`).value = reason.trim();
        }
        if (i === 2 && v === "Comité")
          $(`committee${i}_${d}`).value = confirm(
            "¿Hay cobertura y tiempo compatible para combinar planta y comité?",
          )
            ? "1"
            : "0";
        $(id).value = v;
        $(`override${i}_${d}`).value =
          autoRest(i, d) && v === "Disponible" ? "1" : "0";
        refreshButtons();
        $("statusDialog").close();
        queueDraft();
      };
      root.append(x);
    }
    $("statusDialog").showModal();
  };
});
refreshButtons();
$("previous").addEventListener("change", refreshButtons);

function notify(t) {
  $("feedback").textContent = t;
}
function config() {
  let o = {};
  document.querySelectorAll("input[id]:not([type=file])").forEach((e) => {
    if (e.id) o[e.id] = e.type === "checkbox" ? e.checked : e.value;
  });
  return o;
}
function applyConfig(o) {
  Object.entries(o).forEach(([k, v]) => {
    if ($(k))
      $(k).type === "checkbox"
        ? ($(k).checked = v)
        : ($(k).value =
            /^eve[0-4]$/.test(k) && typeof v === "boolean"
              ? String(Number(v))
              : v);
  });
  refreshButtons();
}
function save() {
  if (store("mmf-template", config())) notify("Configuración guardada.");
}
function load() {
  let o = read("mmf-template");
  if (o) {
    applyConfig({ ...migrateConfig(o), week: $("week").value });
    queueDraft();
    notify("Configuración recuperada.");
  } else notify("No hay configuración guardada.");
}
function commitCursor() {
  finalizeWeek();
}
function snapshot() {
  return {
    config: config(),
    result,
    required,
    afternoons,
    cursorEnd,
    autoPerson,
    locks: Object.fromEntries(locks),
    cells: names.map((_, i) =>
      ds.map((_, d) => $("r" + i + "_" + d).innerText),
    ),
  };
}
function archivePlan() {
  finalizeWeek();
}
function applyPlan(o) {
  locks = new Map(Object.entries(o.locks || {}));
  applyConfig(o.config);
  ({ result, required, afternoons, cursorEnd, autoPerson } = o);
  render();
  o.cells.forEach((row, i) =>
    row.forEach((v, d) => ($("r" + i + "_" + d).innerText = v)),
  );
  recolor();
  validate();
  refreshButtons();
  dirty = false;
  notify("Planning recuperado, incluidas las ediciones manuales.");
}
function restorePlan() {
  let o = read("mmf-plan-" + $("week").value);
  if (o) applyPlan(o);
  else notify("No hay planning guardado para esta semana.");
  queueDraft();
}
function backupPlan() {
  if (!result.length) return notify("Genera primero el planning.");
  const file = new File(
    [JSON.stringify(snapshot())],
    "Planning_MMF_" + $("week").value + ".json",
    { type: "application/json" },
  );
  shareOrDownload(file, false);
}
async function importPlan(e) {
  try {
    const file = e.files[0];
    if (file.size > 100 * 1024 * 1024) throw Error("Copia demasiado grande.");
    const plan = migratePlan(JSON.parse(await file.text()));
    if (
      !confirm("¿Abrir el planning de " + plan.config.week + " como borrador?")
    )
      return;
    applyPlan(plan);
    queueDraft();
  } catch (e) {
    notify("Copia no válida.");
  } finally {
    e.value = "";
  }
}
function printPlan() {
  if (!result.length) return notify("Genera primero el planning.");
  notify("Si no aparece el diálogo, utiliza Descargar PDF o Ctrl+P / Cmd+P.");
  window.print();
}
function recolor() {
  const colors = [
    ["Planta", "#dcebf5"],
    ["Consulta 4", "#f9e5b8"],
    ["MARECU", "#f5d4e4"],
    ["Consulta 5", "#fce2cc"],
    ["Q obstétrico", "#e9ddf3"],
    ["Q ginecológico", "#e9ddf3"],
    ["Histeroscopias", "#e9ddf3"],
    ["Grande Covián", "#dcebd4"],
    ["CME", "#dcebd4"],
    ["Versiones", "#c8e8e5"],
    ["Eco 3D", "#d5e3fa"],
    ["Despacho", "#e5d9c6"],
    ["Comité", "#f3d0b8"],
  ];
  document
    .querySelectorAll(".planning td div[contenteditable]")
    .forEach((e) => {
      let a = e.innerText.split("/").map((x) => x.trim());
      let cs = a
        .map(
          (x) =>
            colors.find(([k]) =>
              x.toLowerCase().includes(k.toLowerCase()),
            )?.[1],
        )
        .filter(Boolean);
      e.parentElement.style.background =
        cs.length > 1
          ? "linear-gradient(135deg," +
            cs
              .map(
                (c, i) =>
                  c +
                  " " +
                  (i / cs.length) * 100 +
                  "%, " +
                  c +
                  " " +
                  ((i + 1) / cs.length) * 100 +
                  "%",
              )
              .join(",") +
            ")"
          : cs[0] || "#edf0f2";
    });
}
$("out").addEventListener("input", recolor);

let dirty = false;
const planKey = "mmf-plan-";
function downloadBlob(blob, name) {
  let a = document.createElement("a");
  let u = URL.createObjectURL(blob);
  a.href = u;
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(u);
  }, 30000);
}
function historyData() {
  return workspace;
}
function historyList() {
  let root = $("history");
  root.replaceChildren();
  let keys = Object.keys(historyData())
    .filter((k) => k.startsWith(planKey))
    .sort()
    .reverse();
  if (!keys.length)
    root.textContent = "No hay semanas archivadas en este navegador.";
  for (let k of keys) {
    let row = document.createElement("p");
    row.textContent = k.slice(planKey.length) + " · ";
    for (let [label, fn] of [
      [
        "Abrir",
        () => {
          if (!dirty || confirm("¿Descartar cambios sin guardar?")) {
            applyPlan(read(k));
            openWeek = $("week").value;
            queueDraft();
            dirty = false;
          }
        },
      ],
      [
        "Copia JSON",
        () =>
          downloadBlob(
            new Blob([JSON.stringify(read(k))], { type: "application/json" }),
            k + ".json",
          ),
      ],
      [
        "Eliminar",
        () => {
          if (confirm("¿Eliminar esta semana del histórico?")) {
            delete workspace[k];
            changed();
            historyList();
          }
        },
      ],
    ]) {
      let b = document.createElement("button");
      b.textContent = label;
      b.className = "secondary";
      b.onclick = fn;
      row.append(b);
    }
    root.append(row);
  }
}
function shareOrDownload(file, share) {
  if (share && navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch((error) => {
      if (error.name !== "AbortError") downloadBlob(file, file.name);
    });
  } else downloadBlob(file, file.name);
}
function exportHistory(share = false) {
  const data = { ...historyData(), "mmf-config-v6": config() };
  const file = new File(
    [JSON.stringify({ version: 11, data })],
    "Planning_MMF_copia.json",
    { type: "application/json" },
  );
  shareOrDownload(file, share);
  $("historyStatus").textContent =
    "Copia completa preparada. Puedes guardarla en iCloud Drive.";
}
function profileId(value) {
  if (["Nadie", "SIN COBERTURA", ...names].includes(value)) return value;
  const matches = names.filter((_, index) => profile(index) === value);
  if (matches.length === 1) return matches[0];
  throw Error(
    "Perfil desconocido o duplicado. Si la copia es antigua, configura sus nombres en Perfiles locales.",
  );
}
function migrateConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Configuración inválida.");
  const output = {};
  for (const [key, val] of Object.entries(value)) {
    const input = document.getElementById(key);
    if (!input || input.tagName !== "INPUT" || input.type === "file") continue;
    if (input.type === "checkbox") {
      if (typeof val === "boolean") output[key] = val;
      continue;
    }
    if (
      typeof val !== "string" &&
      typeof val !== "number" &&
      typeof val !== "boolean"
    )
      continue;
    let adapted = String(val).slice(0, 500);
    if (key === "gyn") adapted = profileId(adapted);
    if (["rotation", "jdRotation"].includes(key)) {
      adapted = adapted
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => {
          try {
            return profileId(token);
          } catch {
            return token;
          }
        })
        .join(", ");
    }
    if (/^s[0-7]_/.test(key) && !statuses.includes(adapted))
      throw Error("Disponibilidad desconocida.");
    if (key === "gyn" && !["Nadie", ...names].includes(adapted))
      throw Error("Responsable desconocido.");
    if (key === "nocme" && !["auto", "0", "1", "2", "3", "4"].includes(adapted))
      throw Error("Preferencia hospitalaria inválida.");
    if (/^ae/.test(key) && !["0", "1", "2"].includes(adapted))
      throw Error("AE inválida.");
    output[key] =
      /^eve[0-4]$/.test(key) && typeof val === "boolean"
        ? String(Number(val))
        : adapted;
  }
  if (/^[0-4]$/.test(value.hyst)) output["hyst" + value.hyst] = true;
  if (output.week && !isMonday(output.week)) throw Error("Semana inválida.");
  return output;
}
function isMonday(date) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    new Date(date + "T00:00:00Z").getUTCDay() === 1 &&
    shift(date, 0) === date
  );
}
function migratePlan(value) {
  const config = migrateConfig(value?.config);
  const isArray = (value, size) =>
    Array.isArray(value) && value.length === size;
  const tasks = new Set([...activities, "Planta 2"]);
  const taskList = (row) =>
    Array.isArray(row) &&
    row.length <= activities.length &&
    row.every((task) => tasks.has(task));
  if (
    !isMonday(config.week) ||
    !isArray(value.cells, 8) ||
    !value.cells.every(
      (row) =>
        isArray(row, 7) &&
        row.every((cell) => typeof cell === "string" && cell.length <= 5000),
    ) ||
    !isArray(value.result, 7) ||
    !value.result.every((day) => isArray(day, 8) && day.every(taskList)) ||
    !isArray(value.required, 7) ||
    !value.required.every(taskList) ||
    !isArray(value.afternoons, 7) ||
    !Number.isSafeInteger(value.cursorEnd) ||
    !Number.isInteger(value.autoPerson) ||
    value.autoPerson < -1 ||
    value.autoPerson > 7
  )
    throw Error("Estructura de planning inválida.");
  const afternoons = value.afternoons.map((day) => {
    const list = Array.isArray(day) ? day : day === "" ? [] : [day];
    if (list.length > 16 || !list.every((person) => typeof person === "string"))
      throw Error("Turnos inválidos.");
    return list.map(profileId);
  });
  const locks = Object.fromEntries(
    Object.entries(value.locks || {}).filter(
      ([key, val]) =>
        /^[0-7]_[0-6]$/.test(key) &&
        typeof val === "string" &&
        val.length <= 5000,
    ),
  );
  return {
    config,
    result: value.result,
    required: value.required,
    afternoons,
    cursorEnd: value.cursorEnd,
    autoPerson: value.autoPerson,
    cells: value.cells,
    locks,
  };
}
async function importHistory(input) {
  try {
    const file = input.files[0];
    if (file.size > 100 * 1024 * 1024) throw Error("Copia demasiado grande.");
    const raw = JSON.parse(await file.text());
    const data =
      raw.config && raw.cells
        ? { [planPrefix + raw.config.week]: raw }
        : raw.data;
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw Error("Copia inválida.");
    const updates = {};
    let omitted = 0;
    for (const [key, value] of Object.entries(data)) {
      if (key === "mmf-profiles") {
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw Error("Perfiles inválidos.");
        updates[key] = Object.fromEntries(
          names
            .filter((id) => typeof value[id] === "string")
            .map((id) => [id, value[id].trim().slice(0, 70)])
            .filter(([, label]) => label),
        );
      } else if (key === "mmf-template") updates[key] = migrateConfig(value);
      else if (key === "mmf-draft" || key === "mmf-versions") {
        updates[key] = Object.fromEntries(
          Object.entries(value).map(([week, entry]) => {
            if (!isMonday(week)) throw Error("Semana inválida.");
            const entries = key === "mmf-versions" ? entry : [entry];
            const migrated = entries.map((item) => {
              const plan = item.cells
                ? migratePlan(item)
                : { config: migrateConfig(item.config) };
              if (plan.config.week !== week)
                throw Error("La fecha no coincide con el planning.");
              return plan;
            });
            return [week, key === "mmf-versions" ? migrated : migrated[0]];
          }),
        );
      } else if (key === "mmf-config-v6" || key === "mmf-config")
        updates["mmf-config-v6"] = migrateConfig(value);
      else if (
        key.startsWith(planPrefix) &&
        isMonday(key.slice(planPrefix.length))
      ) {
        updates[key] = migratePlan(value);
        if (updates[key].config.week !== key.slice(planPrefix.length))
          throw Error("La fecha no coincide con el planning.");
      } else if (
        /^mmf-turn-/.test(key) &&
        isMonday(key.slice(9)) &&
        (Number.isSafeInteger(value) || Number.isSafeInteger(value?.cursor))
      ) {
        updates[key] = Number.isSafeInteger(value)
          ? value
          : {
              cursor: value.cursor,
              assignments: value.assignments
                .map((day) => day.map(profileId))
                .map((day) => {
                  if (
                    !day.every((person) =>
                      [...names, "SIN COBERTURA"].includes(person),
                    )
                  )
                    throw Error("Turnos inválidos.");
                  return day;
                }),
            };
      } else omitted++;
    }
    const keys = Object.keys(updates);
    if (!keys.length)
      throw Error("La copia no contiene registros compatibles.");
    const duplicates = keys.filter((key) => key in workspace);
    if (
      !confirm(
        "Importar " +
          keys.length +
          " registros. Se sustituirán " +
          duplicates.length +
          " coincidencias y se omitirán " +
          omitted +
          " campos.",
      )
    )
      return;
    for (const key of ["mmf-draft", "mmf-versions"]) {
      if (updates[key]) updates[key] = { ...workspace[key], ...updates[key] };
    }
    Object.assign(workspace, updates);
    const week =
      updates["mmf-config-v6"]?.week ||
      Object.keys(updates)
        .find((key) => key.startsWith(planPrefix))
        ?.slice(planPrefix.length) ||
      openWeek;
    openDraft(week);
    refreshProfiles();
    historyList();
    const saved = await changed();
    $("historyStatus").textContent = saved
      ? "Copia recuperada en este dispositivo."
      : "Copia abierta. Comprueba el estado del guardado local.";
  } catch (error) {
    $("historyStatus").textContent = error.message;
  } finally {
    input.value = "";
  }
}

function downloadPDF(share = false) {
  if (!result.length) return notify("Genera primero el planning.");
  try {
    const selected = $("view").value;
    $("view").value = "week";
    applyView();
    let table = $("out").querySelector("table"),
      canvas = document.createElement("canvas");
    canvas.width = 1684;
    canvas.height = 1190;
    let c = canvas.getContext("2d");
    c.fillStyle = "white";
    c.fillRect(0, 0, 1684, 1190);
    c.fillStyle = "#24495d";
    c.font = "bold 38px Arial";
    c.fillText("Planning MMF · " + $("week").value, 55, 70);
    let widths = [230, ...Array(7).fill(192)],
      y = 110;
    for (let [ri, row] of [...table.rows].entries()) {
      let x = 55,
        h = ri === 0 ? 75 : 110;
      for (let [j, cell] of [...row.cells].entries()) {
        let w = widths[j];
        let bg = getComputedStyle(cell).backgroundColor;
        let grad = cell.style.background.match(/#[0-9a-f]{6}/gi);
        if (grad && grad.length > 1) {
          let colors = [...new Set(grad)];
          colors.forEach((v, k) => {
            c.fillStyle = v;
            c.fillRect(
              x + (k * w) / colors.length,
              y,
              w / colors.length - 3,
              h - 3,
            );
          });
        } else {
          c.fillStyle =
            ri === 0 || j === 0
              ? "#24495d"
              : bg === "rgba(0, 0, 0, 0)"
                ? "#edf0f2"
                : bg;
          c.fillRect(x, y, w - 3, h - 3);
        }
        c.fillStyle = ri === 0 || j === 0 ? "white" : "#203444";
        c.font = (ri === 0 || j === 0 ? "bold " : "") + "24px Arial";
        c.textAlign = "center";
        let lines = [];
        for (let part of (cell.querySelector("[contenteditable]")
          ? cell.querySelector("[contenteditable]").innerText +
            "\n" +
            cell.querySelector(".pm").innerText
          : cell.innerText
        ).split("\n")) {
          let line = "";
          for (let word of part.split(" ")) {
            if (c.measureText(line + " " + word).width > w - 14 && line) {
              lines.push(line);
              line = word;
            } else line += (line ? " " : "") + word;
          }
          if (line) lines.push(line);
        }
        let step = Math.min(27, (h - 10) / Math.max(1, lines.length));
        lines.forEach((l, k) =>
          c.fillText(
            l,
            x + w / 2,
            y + h / 2 + (k - (lines.length - 1) / 2) * step + 7,
            w - 12,
          ),
        );
        x += w;
      }
      y += h;
    }
    c.textAlign = "left";
    c.fillStyle = "#203444";
    c.font = "22px Arial";
    c.fillText(
      "JD: jornada deslizada · AE: actividad extraordinaria",
      55,
      1120,
    );
    let jpg = atob(canvas.toDataURL("image/jpeg", 0.95).split(",")[1]);
    let parts = ["%PDF-1.4\n"],
      offsets = [0],
      len = parts[0].length;
    function add(n, v) {
      offsets[n] = len;
      let t = n + " 0 obj\n" + v + "\nendobj\n";
      parts.push(t);
      len += t.length;
    }
    add(1, "<< /Type /Catalog /Pages 2 0 R >>");
    add(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    add(
      3,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
    );
    add(
      4,
      "<< /Type /XObject /Subtype /Image /Width 1684 /Height 1190 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " +
        jpg.length +
        " >>\nstream\n" +
        jpg +
        "\nendstream",
    );
    let stream = "q 841.89 0 0 595.28 0 0 cm /Im0 Do Q";
    add(
      5,
      "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream",
    );
    parts.push(
      "xref\n0 6\n0000000000 65535 f \n" +
        offsets
          .slice(1)
          .map((x) => String(x).padStart(10, "0") + " 00000 n \n")
          .join("") +
        "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" +
        len +
        "\n%%EOF",
    );
    let bytes = Uint8Array.from(parts.join(""), (x) => x.charCodeAt(0));
    const file = new File([bytes], "Planning_MMF_" + $("week").value + ".pdf", {
      type: "application/pdf",
    });
    $("view").value = selected;
    applyView();
    const download = () => {
      downloadBlob(file, file.name);
      notify("PDF preparado para descargar.");
    };
    if (share && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file] }).catch((error) => {
        if (error.name !== "AbortError") download();
      });
    } else download();
  } catch (e) {
    notify("Error al generar PDF: " + e.message);
  }
}
window.addEventListener("beforeunload", (e) => {
  if (pending) {
    e.preventDefault();
    e.returnValue = "";
  }
});

function statusSync(message) {
  $("syncStatus").textContent = message;
}
let writeQueue = Promise.resolve(true);
function changed() {
  if (!ready) return Promise.resolve(false);
  const generation = ++epoch;
  pending = true;
  statusSync("Guardando en este dispositivo…");
  writeQueue = writeQueue.then(() => saveLocal(generation));
  return writeQueue;
}
async function saveLocal(generation) {
  if (generation !== epoch) return false;
  if (conflict) return false;
  try {
    revision = await writeWorkspace(revision, structuredClone(workspace));
    if (generation === epoch) {
      pending = false;
      $("retrySync").hidden = true;
      statusSync("Guardado en este dispositivo");
    }
    return true;
  } catch (error) {
    conflict = error.message === "conflict";
    $("acceptRemote").hidden = !conflict;
    $("retrySync").hidden = conflict;
    statusSync(
      conflict
        ? "Otra pestaña guardó cambios. Descarga una copia antes de recargar."
        : "No se pudo guardar. Descarga una copia JSON para conservar los cambios.",
    );
    return false;
  }
}
function store(key, value) {
  workspace[key] = value;
  changed();
  return true;
}
function queueDraft() {
  if (!ready || !isMonday($("week").value)) return;
  openWeek = $("week").value;
  const drafts = (workspace["mmf-draft"] ??= {});
  drafts[openWeek] =
    result.length && $("r0_0") ? snapshot() : { config: config() };
  workspace["mmf-config-v6"] = config();
  changed();
}
function finalizeWeek() {
  if (!ready || !result.length) return notify("Genera primero el planning.");
  const week = $("week").value;
  if (!isMonday(week)) return notify("Selecciona un lunes.");
  const key = planPrefix + week,
    turn = "mmf-turn-" + week;
  const current = snapshot();
  if (
    workspace[key] &&
    JSON.stringify(workspace[key]) === JSON.stringify(current)
  )
    return notify("Este planning ya está confirmado.");
  if (workspace[key]) {
    if (!confirm("¿Guardar una revisión? El turno ya confirmado se mantiene."))
      return;
    const versions = (workspace["mmf-versions"] ??= {});
    (versions[week] ??= []).push(workspace[key]);
  }
  workspace[key] = current;
  if (!(turn in workspace))
    workspace[turn] = {
      cursor: cursorEnd,
      assignments: structuredClone(afternoons),
    };
  queueDraft();
  historyList();
  showRevisions();
  dirty = false;
  notify(
    "Planning definitivo guardado en el histórico. Consulta el estado del guardado local.",
  );
}
function showRevisions() {
  const root = $("revisions");
  root.replaceChildren();
  const versions = workspace["mmf-versions"]?.[$("week").value] || [];
  versions.forEach((plan, index) => {
    const button = document.createElement("button");
    button.textContent = "Recuperar revisión " + (index + 1);
    button.onclick = () => {
      applyPlan(plan);
      queueDraft();
    };
    root.append(button);
  });
}
function openDraft(week) {
  openWeek = week;
  dirty = false;
  locks = new Map();
  result = [];
  required = [];
  afternoons = [];
  autoPerson = -1;
  const draft = workspace["mmf-draft"]?.[week] || workspace[planPrefix + week];
  applyConfig(initialConfig);
  if (draft?.cells) applyPlan(migratePlan(draft));
  else {
    const preferences = workspace["mmf-config-v6"] || {};
    for (const [key, value] of Object.entries(preferences)) {
      if (/^(skill|active|rotation$|jdRotation$|cursor$)/.test(key))
        applyConfig({ [key]: value });
    }
    const recentTurn = Object.keys(workspace)
      .filter((key) => key.startsWith("mmf-turn-") && key.slice(9) < week)
      .sort()
      .at(-1);
    if (recentTurn)
      $("cursor").value = workspace[recentTurn].cursor ?? workspace[recentTurn];
    applyConfig(
      draft?.config
        ? migrateConfig(draft.config)
        : preferences.week === week
          ? migrateConfig(preferences)
          : { week },
    );
    $("out").textContent =
      "Introduce las disponibilidades y pulsa Generar planning.";
    $("alerts").replaceChildren();
    $("nextcursor").textContent = "";
  }
  showRevisions();
}
async function loadLocal() {
  try {
    const local = await readWorkspace();
    workspace = local.data;
    revision = local.revision;
    const week = workspace["mmf-config-v6"]?.week || monday;
    openDraft(isMonday(week) ? week : monday);
    refreshProfiles();
    historyList();
    ready = true;
    pending = false;
    conflict = false;
    $("acceptRemote").hidden = true;
    $("retrySync").hidden = true;
    statusSync("Guardado en este dispositivo");
  } catch (error) {
    ready = true;
    $("retrySync").hidden = false;
    statusSync(
      "Almacenamiento local inaccesible. Descarga una copia JSON antes de cerrar.",
    );
  }
}
const initialConfig = config();
for (const [id, type] of [
  ["sharePDF", "application/pdf"],
  ["shareCSV", "text/csv"],
  ["shareBackup", "application/json"],
]) {
  $(id).hidden = !navigator.canShare?.({
    files: [new File([""], "planning." + type.split("/").at(-1), { type })],
  });
}
$("retrySync").onclick = () => (pending ? changed() : loadLocal());
$("acceptRemote").onclick = () => {
  if (
    confirm("¿Descartar los cambios pendientes de esta pestaña y recargar?")
  ) {
    ++epoch;
    void loadLocal();
  }
};
$("view").onchange = applyView;
$("viewItem").onchange = applyView;
document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.dataset.profile !== undefined) {
    const profiles = (workspace["mmf-profiles"] ??= {});
    const id = names[Number(target.dataset.profile)];
    const value = target.value.trim();
    if (value) profiles[id] = value;
    else delete profiles[id];
    refreshProfiles();
    if (result.length) validate();
    changed();
  } else if (target.dataset.lock) {
    const key = target.dataset.lock;
    if (target.checked) locks.set(key, $("r" + key).innerText);
    else locks.delete(key);
    queueDraft();
  } else if (target.id === "week") {
    const week = target.value;
    if (!isMonday(week)) {
      target.value = openWeek || monday;
      notify("Selecciona un lunes.");
      return;
    }
    openDraft(week);
    queueDraft();
  } else if (target.tagName === "INPUT" && target.type !== "file") queueDraft();
});
$("out").addEventListener("input", (event) => {
  if (event.target.id?.startsWith("r") && locks.has(event.target.id.slice(1)))
    locks.set(event.target.id.slice(1), event.target.innerText);
  validate();
  queueDraft();
});
const actions = {
  toggleJD,
  toggleAE,
  commitCursor,
  generate,
  save,
  load,
  archivePlan,
  restorePlan,
  backupPlan,
  importPlan,
  review: () => {
    validate();
    if (result.length)
      notify("Revisión actualizada. Consulta las incidencias.");
  },
  printPlan,
  downloadPDF,
  sharePDF: () => downloadPDF(true),
  csv,
  shareCSV: () => csv(true),
  exportHistory,
  shareHistory: () => exportHistory(true),
  importHistory,
  cancelDialog: () => $("statusDialog").close(),
};
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button?.dataset.action) actions[button.dataset.action]();
  if (button?.dataset.jd) toggleJD(button.dataset.jd);
  if (button?.dataset.ae) toggleAE(button.dataset.ae);
});
document
  .querySelectorAll("input[data-import]")
  .forEach((input) =>
    input.addEventListener("change", () =>
      actions[input.dataset.import](input),
    ),
  );
await loadLocal();
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js").catch(() => {});
}
