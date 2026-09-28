import { mount } from 'svelte'
import './app.css'

// The same page opens as the app, or -- with ?popup=clock -- as one of the
// small always-on-top windows for a clock block's timer or alarm on the
// Windows app (utils/clockPopups.js). Only what is shown differs; both read
// the same local storage, which is what keeps them in step.
const popup = new URLSearchParams(location.search).get('popup') === 'clock'

const app = popup
  ? import('./popup/ClockPopup.svelte').then(({ default: ClockPopup }) =>
      mount(ClockPopup, { target: document.getElementById('app') }))
  : import('./App.svelte').then(({ default: App }) =>
      mount(App, { target: document.getElementById('app') }))

export default app
