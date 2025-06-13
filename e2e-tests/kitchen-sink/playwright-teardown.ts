async function globalTeardown() {
  const pid = process.env.APP_PROCESS_PID;
  console.log('Killing server...', pid);
  if (pid) {
    process.kill(parseInt(pid));
  }
}

export default globalTeardown;
