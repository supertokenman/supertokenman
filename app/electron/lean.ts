// Built-in tools a panel in this app does not need, left out so their definitions are not sent with
// every turn. Measured with Claude Code's own context count (Haiku, no conversation): Workflow and
// ScheduleWakeup are sent every turn (about 2,700 tokens together); the rest wait until looked up
// but still list their names. Coding tools (Bash, Read, Edit, Write, Agent, the web, tasks) stay.
export const LEAN_OFF = [
  // multi-agent orchestration scripts: panels are one conversation each
  'Workflow',
  // /loop's self-paced wake-ups and scheduled prompts: the app has its own triggers
  'ScheduleWakeup',
  'CronCreate',
  'CronDelete',
  'CronList',
  'RemoteTrigger',
  // phone notifications from a cloud session
  'PushNotification',
  // a panel stays in the folder it was opened in
  'EnterWorktree',
  'ExitWorktree',
]
/** What leaving them out saved per turn when measured, for the Savings sheet. */
export const LEAN_SAVES = 2734
