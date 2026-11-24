// Civil dates are represented as ISO dates and UTC is used only for arithmetic.
export function shift(date, days) {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function restSources(date) {
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  if (weekday === 1) return [shift(date, -2), shift(date, -1)];
  if (weekday === 2) return [shift(date, -2), shift(date, -1)];
  if (weekday >= 3 && weekday <= 5) return [shift(date, -1)];
  return [];
}

export function schedule(input) {
  const { people, days, rotation, combine, office, autoJD, hospital } = input;
  const available = (i, d) =>
    people[i].active &&
    ["Disponible", "Guardia", "Comité"].includes(days[d].status[i]);
  const eligible = (i, task, d, jd) => {
    const person = people[i];
    if (
      !available(i, d) ||
      i === jd ||
      !person.skills.includes(task === "Planta 2" ? "Planta" : task)
    )
      return false;
    if (
      days[d].status[i] === "Comité" &&
      !(i === 2 && days[d].committee[i] && task === "Planta")
    )
      return false;
    return task !== "Q ginecológico" || days[d].gyn === i;
  };
  const cost = (i, task, d, hospitalDay, prior) => {
    const preference =
      {
        Planta: i === 2 ? 0 : 8,
        "Planta 2": 8,
        "Q obstétrico": i === 0 ? 500 : i === 3 ? 5 : 10,
        "Consulta 4": i === 3 ? 40 : 5,
        "Consulta 5": i === 3 ? 0 : 8,
        "Grande Covián":
          i === 3 ? (d === hospitalDay ? 60 : 0) : d === hospitalDay ? 2 : 55,
        "Eco 3D": i === 2 ? 0 : 12,
        Versiones: i === 0 ? 0 : 15,
        Histeroscopias: i === 4 ? 0 : 25,
        MARECU: i === 4 ? 0 : 3,
        Despacho: 0,
      }[task] ?? 5;
    const general = [1, 4, 5, 6, 7].includes(i);
    return (
      preference +
      (prior[d - 1]?.[i].includes(task) ? 0 : 3) +
      (general
        ? Math.min(
            15,
            (people[i].history?.[task] || 0) +
              prior.filter((day) => day[i].includes(task)).length,
          )
        : 0)
    );
  };

  function morning(d, jd, hospitalDay, prior) {
    const day = days[d];
    const required = day.tasks;
    const tasks = [
      ...required,
      ...(required.includes("Planta") ? ["Planta 2"] : []),
      ...(office && required.length ? ["Despacho"] : []),
    ];
    const rows = people.map(() => []);
    const hystPair =
      required.includes("Q obstétrico") &&
      required.includes("Histeroscopias") &&
      eligible(4, "Q obstétrico", d, jd) &&
      eligible(4, "Histeroscopias", d, jd);
    const missing = (task) =>
      ({ Planta: 100000, "Planta 2": 90, Despacho: 30 })[task] ?? 10000;
    const prices = tasks.map((task) =>
      people.map((_, i) => cost(i, task, d, hospitalDay, prior)),
    );
    const candidates = tasks.map((task, k) =>
      people
        .map((_, i) => i)
        .filter((i) => eligible(i, task, d, jd))
        .sort((a, b) => prices[k][a] - prices[k][b]),
    );
    const lower = Array(tasks.length + 1).fill(0);
    for (let k = tasks.length - 1; k >= 0; k--) {
      lower[k] =
        lower[k + 1] +
        Math.min(missing(tasks[k]), ...candidates[k].map((i) => prices[k][i]));
    }
    const alternatives = [];
    const limit = 3;
    function visit(k, score) {
      if (
        alternatives.length === limit &&
        score + lower[k] >= alternatives.at(-1).score
      )
        return;
      if (k === tasks.length) {
        if (
          hystPair &&
          rows[4].includes("Histeroscopias") &&
          !rows[4].includes("Q obstétrico")
        )
          return;
        alternatives.push({ assignment: rows.map((row) => [...row]), score });
        alternatives.sort((a, b) => a.score - b.score);
        if (alternatives.length > limit) alternatives.pop();
        return;
      }
      const task = tasks[k];
      const locked = day.locks.findIndex((value) =>
        value
          ?.split("/")
          .map((part) => part.trim())
          .includes(task),
      );
      for (const i of candidates[k]) {
        if (locked !== -1 && i !== locked) continue;
        const row = rows[i];
        const lockedTasks = day.locks[i]?.split("/").map((part) => part.trim());
        if (
          lockedTasks &&
          !lockedTasks.includes(task === "Planta 2" ? "Planta" : task)
        )
          continue;
        const paired =
          hystPair &&
          i === 4 &&
          row.length === 1 &&
          [row[0], task].includes("Histeroscopias") &&
          [row[0], task].includes("Q obstétrico");
        const shared =
          combine &&
          row.length === 1 &&
          row.includes("Planta") &&
          ["Versiones", "Q obstétrico", "Eco 3D"].includes(task);
        const officePair =
          i === 2 &&
          task === "Despacho" &&
          row.length === 1 &&
          (row.includes("Eco 3D") ||
            (row.includes("Planta") &&
              rows.some((other) => other.includes("Planta 2"))));
        if (row.length && !paired && !shared && !officePair) continue;
        row.push(task);
        visit(k + 1, score + prices[k][i] + (shared ? 700 : 0));
        row.pop();
      }
      visit(k + 1, score + missing(task));
    }
    visit(0, 0);
    return alternatives;
  }

  const thursday = days[3];
  const manualJD = thursday.jd.filter(
    (i) =>
      thursday.tasks.length &&
      people[i].jd &&
      available(i, 3) &&
      thursday.status[i] === "Disponible",
  );
  const jdOptions = manualJD.length
    ? [manualJD[0]]
    : autoJD && thursday.tasks.length
      ? people
          .map((_, i) => i)
          .filter(
            (i) =>
              people[i].jd &&
              available(i, 3) &&
              thursday.status[i] === "Disponible",
          )
      : [-1];
  const jdRotation = input.jdRotation || [];
  const jdRank = (i) =>
    jdRotation.includes(i) ? jdRotation.indexOf(i) : jdRotation.length;
  const hospitalOptions =
    hospital === "auto" ? [0, 1, 2, 3, 4] : [Number(hospital)];
  let best;
  for (const jd of jdOptions.length ? jdOptions : [-1]) {
    for (const hospitalDay of hospitalOptions) {
      const jdCost =
        jd < 0
          ? 0
          : Math.min(20, people[jd].history?.JD || 0) + jdRank(jd) / 100;
      const priority = (a, b) => a.score - b.score;
      let weeks = [{ result: [], score: jdCost }];
      for (let d = 0; d < days.length; d++) {
        weeks = weeks
          .flatMap((week) =>
            morning(d, d === 3 ? jd : -1, hospitalDay, week.result).map(
              (day) => ({
                result: [...week.result, day.assignment],
                score: week.score + day.score,
              }),
            ),
          )
          .sort(priority)
          .slice(0, 4);
      }
      if (!best || weeks[0].score < best.score)
        best = { ...weeks[0], jd, hospitalDay };
    }
  }
  let cursor = rotation.length
    ? ((input.cursor % rotation.length) + rotation.length) % rotation.length
    : 0;
  const skipped = [];
  const afternoons = days.map((day, d) => {
    const allowed = (i) =>
      people[i]?.active && people[i].ae && day.status[i] === "Disponible";
    const assigned = day.ae.flatMap((count, i) =>
      allowed(i) ? Array(Math.min(count, day.doubleAE[i] ? 2 : 1)).fill(i) : [],
    );
    while (assigned.length < day.evenings) {
      let found = false;
      for (let step = 0; step < rotation.length; step++) {
        const index = (cursor + step) % rotation.length;
        const i = rotation[index];
        if (!allowed(i) || assigned.includes(i)) {
          skipped.push({
            day: d,
            person: i,
            reason: assigned.includes(i) ? "Ya tiene AE" : day.status[i],
          });
          continue;
        }
        assigned.push(i);
        cursor = (index + 1) % rotation.length;
        found = true;
        break;
      }
      if (!found) assigned.push(-1);
    }
    return assigned;
  });
  return {
    ...best,
    afternoons,
    cursor,
    skipped,
    required: days.map((day) => day.tasks),
  };
}
