/**
 * Whether this process should run queue workers.
 *
 * Three roles rather than two. `worker` and the default `api` are the split a
 * real deployment wants — the HTTP process should not lose latency to a book
 * render, and the two scale on different signals.
 *
 * `all` exists because free hosting tiers generally give you one always-on
 * process and charge for the second. Running both in one is genuinely worse
 * under load, and it is the difference between the product being testable for
 * nothing and not being testable at all, so it is offered explicitly rather
 * than reached by accident: nothing selects it unless MASALIM_ROLE says so.
 */
export function shouldRunWorkers(): boolean {
  const role = process.env.MASALIM_ROLE;
  return role === 'worker' || role === 'all';
}
