// The tour, chapter by chapter. Each step acts on the real app; `title` is the caption on screen and
// `say` the narration. Keep a step to one idea and the say line to one sentence.

const closeAll = async ({ page, sleep }) => {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape')
    await sleep(150)
  }
}

// a menu in the top bar, then one of its items: the cursor goes to both
const menu = (title, item) => async (h) => ({
  el: await h.find(`.top button[title*="${title}"]`),
  kind: 'click',
  act: async () => {
    await h.go(`.top button[title*="${title}"]`)
    await h.sleep(450)
    await h.go(`.menu-pop button::-p-text(${item})`)
  },
})

export const CHAPTERS = [
  {
    id: 'panels',
    title: 'Work in panels',
    try: 'composer',
    setup: closeAll,
    steps: [
      { title: 'One panel per project', say: 'Each panel is Claude working in one of your projects.', do: (h) => h.look('.panel') },
      { title: 'Ask in plain words', say: 'Type what you need, in plain words.', do: (h) => h.type('textarea[placeholder^="Ask Claude"]', 'Run the tests and fix what fails') },
      { title: 'Pick how hard it thinks', say: 'Choose the model and how much effort it puts in.', do: (h) => h.look('select:has(option[value="max"])') },
      { title: 'See every change', say: 'Every change it makes shows up here, ready to review.', do: (h) => h.click('[role="tab"]::-p-text(Changes)') },
      { title: 'Ask the whole team', say: 'Or ask the team, and the right persona picks it up.', do: (h) => h.click('.router-pill'), wait: 700 },
      { title: 'Mention a persona', say: 'Start with a mention to choose one yourself.', do: (h) => h.type('.router-pop textarea, .router-pop input', '@reviewer check my last commit') },
    ],
    teardown: closeAll,
  },
  {
    id: 'search',
    title: 'Find anything',
    try: 'palette',
    setup: async (h) => {
      await closeAll(h)
      await (await h.find('[role="tab"]::-p-text(Chat)')).click()
    },
    steps: [
      { title: 'Option Space, from any app', say: 'Press Option Space anywhere on your Mac.', do: (h) => h.press('Meta+k'), kind: 'key', keys: 'Option Space', wait: 700 },
      { title: 'Type a few letters', say: 'Type a few letters: screens, projects, personas, secrets.', do: (h) => h.type('.palette input', 'pers') },
      { title: 'Enter to go', say: 'Press Enter and you are there.', do: (h) => h.press('Enter', '.pal-item.on'), wait: 1100 },
    ],
    teardown: closeAll,
  },
  {
    id: 'personas',
    title: 'Personas',
    try: 'personas',
    setup: closeAll,
    steps: [
      { title: 'Personas are roles', say: 'Personas give Claude a role: reviewer, frontend, devops, writer.', do: menu('Markets, Today, Business', 'Personas') },
      { title: 'Start from a template', say: 'Start from a template, or write your own.', do: (h) => h.look('.sheet') },
    ],
    teardown: closeAll,
  },
  {
    id: 'content',
    title: 'Make content',
    try: 'business',
    setup: closeAll,
    steps: [
      { title: 'Your business, one screen', say: 'Business keeps your content and your social accounts on one screen.', do: menu('Markets, Today, Business', 'Business') },
      { title: 'Name the piece', say: 'Name a piece and write the idea.', do: (h) => h.type('input[placeholder^="New piece"]', 'Why easy runs make you faster') },
      { title: 'Write the idea', say: 'Claude writes the script with your plan.', do: (h) => h.type('textarea[placeholder^="The idea"]', 'Most runs should feel easy. Cite the source.') },
      { title: 'Add it', say: 'The video renders on your Mac, for free.', do: (h) => h.click('.ct-form button.primary, button::-p-text(Add)'), wait: 1200 },
      { title: 'Nothing posts alone', say: 'Nothing goes out until you approve it in the queue.', do: (h) => h.click('[role="tab"]::-p-text(Queue), button::-p-text(Queue)') },
    ],
    teardown: closeAll,
  },
  {
    id: 'triggers',
    title: 'Automate',
    try: 'triggers',
    setup: closeAll,
    steps: [
      { title: 'Triggers run on their own', say: 'Triggers run Claude on a schedule, or when a pull request needs you.', do: menu('Markets, Today, Business', 'Triggers') },
      { title: 'Say what to do', say: 'Say what to do each time, and when.', do: (h) => h.look('.sheet') },
    ],
    teardown: closeAll,
  },
]

// The "Ask the agent" film: each beat's proof, the real screen the answer dives into.
export const ASK_CHAPTERS = [
  {
    id: 'ask-connections',
    title: 'Connections',
    setup: async (h) => {
      await closeAll(h)
      await h.page.keyboard.down('Meta')
      await h.page.keyboard.press('k')
      await h.page.keyboard.up('Meta')
      await h.sleep(300)
      await h.page.keyboard.type('Connections')
      await h.sleep(200)
      await h.page.keyboard.press('Enter')
      await h.sleep(1200)
    },
    steps: [
      { title: 'Every tool in one place', say: 'Connections holds every tool your panels can use.', do: (h) => h.look('.sheet') },
      { title: 'Find it', say: 'Find the one you need.', do: (h) => h.type('.int-find', 'notion') },
      { title: 'Turn it on', say: 'Turn it on.', do: (h) => h.click('.card:has(.card-name[title="Notion"]) .switch') , wait: 600 },
      { title: 'Sign in once', say: 'Sign in once, right here in the app.', do: (h) => h.click('.card:has(.card-name[title="Notion"]) button.small'), wait: 900 },
      { title: 'New panels have it', say: 'And every new panel has it. No setup in the chat.', do: (h) => h.look('.card:has(.card-name[title="Notion"])') },
    ],
    teardown: closeAll,
  },
]
