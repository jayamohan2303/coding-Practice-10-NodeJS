const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')
const app = express()
app.use(express.json())

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

//Authentication Token
const authenticationToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

//convert DB State Object To Response Object
const converDBStateObjectTOResponseObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}
//convert DB Object To Response Object
const convertDBDistrictObjectToResponseObject = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

//API 1

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
  SELECT * from user WHERE username='${username}'
  `
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//API 2
app.get('/states/', authenticationToken, async (request, response) => {
  const getStateArraysQuery = `
  SELECT * FROM state `
  const stateArrays = await db.all(getStateArraysQuery)
  response.send(
    stateArrays.map(eachStateArray =>
      converDBStateObjectTOResponseObject(eachStateArray),
    ),
  )
})

//API 3
app.get('/states/:stateId/', authenticationToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
    SELECT * FROM state WHERE state_id=${stateId}
  `
  const stateArray = await db.get(getStateQuery)
  response.send(converDBStateObjectTOResponseObject(stateArray))
})

//API 4
app.post('/districts/', authenticationToken, async (request, response) => {
  const districtObject = request.body
  const {districtName, stateId, cases, cured, active, deaths} = districtObject
  const addDistrictQuery = `
  INSERT INTO district(district_name,state_id,cases,cured,active,deaths)
  VALUES(
    '${districtName}',
    '${stateId}',
    '${cases}',
    '${cured}',
    '${active}',
    '${deaths}'
  )
  `
  const districtDetails = await db.run(addDistrictQuery)
  response.send('District Successfully Added')
})

//API 5
app.get(
  '/districts/:districtId/',
  authenticationToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `
  SELECT 
    * 
  FROM 
    district 
  WHERE 
    district_id=${districtId}
  `
    const districtDetails = await db.get(getDistrictQuery)
    response.send(convertDBDistrictObjectToResponseObject(districtDetails))
  },
)

//API 6
app.delete(
  '/districts/:districtId/',
  authenticationToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrictQuery = `
  DELETE FROM district WHERE district_id=${districtId}
  `
    await db.run(deleteDistrictQuery)
    response.send('District Removed')
  },
)

//API 7
app.put(
  '/districts/:districtId/',
  authenticationToken,
  async (request, response) => {
    const {districtId} = request.params
    const districtDetails = request.body
    const {districtName, stateId, cases, cured, active, deaths} =
      districtDetails
    const updatedistrictQuery = `
  UPDATE
   district
    SET 
    district_name='${districtName}',
    state_id='${stateId}',
    cases='${cases}',
    cured='${cured}',
    active='${active}',
    deaths='${deaths}'
  WHERE 
    district_id=${districtId}  
  `
    const updatedDistrict = await db.run(updatedistrictQuery)
    response.send('District Details Updated')
  },
)

app.get(
  '/states/:stateId/stats/',
  authenticationToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStateStatsQuery = `
  SELECT  
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
FROM 
  district 
 WHERE 
  state_id=${stateId} 
  `
    const stats = await db.get(getStateStatsQuery)
    response.send({
      totalCases: stats['SUM(cases)'],
      totalCured: stats['SUM(cured)'],
      totalActive: stats['SUM(active)'],
      totalDeaths: stats['SUM(deaths)'],
    })
  },
)

module.exports = app
