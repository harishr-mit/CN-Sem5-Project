/**
 * parentWatch.ts — exit when the launcher (scripts/demo.mjs) dies.
 * On Windows a killed parent does not take its children with it, which used
 * to leave ports 8080/9000/9001 bound. The launcher passes its pid in
 * NOBU_PARENT_PID; we poll it and exit once it is gone.
 */

export function exitWithParent(onExit?: () => void): void {
  const pid = Number(process.env.NOBU_PARENT_PID);
  if (!pid) return;
  const timer = setInterval(() => {
    try {
      process.kill(pid, 0); // signal 0 = existence check
    } catch {
      clearInterval(timer);
      onExit?.();
      process.exit(0);
    }
  }, 1000);
  timer.unref();
}
