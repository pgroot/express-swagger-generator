const express = require('express')
const app = express()
const expressSwagger = require('../index')(app)
expressSwagger({
  swaggerDefinition: {
    info: {
      title: require('../package.json').name, //eslint-disable-line
    },
  },
  basedir: __dirname,
  files: ['./**/*.js'],
})

/**
 * Get the fleet Desired State
 * @route GET /api/v1/fleets/{fleetId}/desired-states
 * @group DesiredStates - Fleet Desired States
 * @param {string} fleetId.path.required - Fleet Id
 * @returns {Object} 200 - Desired State
 * @returns {Error}  500 - Unexpected error
 */
app.get('/', (req, res) => res.send('Hello World!'))

app.listen(3000, () => console.log('Example app listening on port 3000!'))