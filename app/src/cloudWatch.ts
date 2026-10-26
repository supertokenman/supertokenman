// the background check for machines left running; off until the person turns it on in the Cloud sheet
const WATCH_KEY = 'stm.cloudWatch'
export const cloudWatchOn = () => {
  try {
    return localStorage.getItem(WATCH_KEY) === '1'
  } catch {
    return false
  }
}
export const setCloudWatch = (on: boolean) => {
  try {
    localStorage.setItem(WATCH_KEY, on ? '1' : '0')
  } catch {
    // stays off after a restart
  }
}

