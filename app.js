const dotenv = require('dotenv')
dotenv.config()
const express = require("express");
const app = express();
const cors = require("cors");
const path = require("path");
const { promises: fs } = require("fs");
const { Expo } = require("expo-server-sdk");
const NadraUserDatabase = require("./NADRA");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
const multer = require("multer");
const getData = require("./handler");
const expo = new Expo();

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    cb(null, "public/images");
  },
  filename: function (req, file, cb) {
    cb(null, `${req.body.cnic}.jpg`);
  },
});

const upload = multer({ storage: storage });

const verifyUserCredentials = async (req, res, next) => {
  const { cnic } = req.body;

  let _verify = NadraUserDatabase.filter((value) => value.cnic === cnic);

  if (!_verify) {
    return res.status(400).json({ message: "CNIC not found", status: false });
  }

  const usersArray = await getData("Users.json");
  console.log(usersArray.length);
  _verify =
    usersArray.length > 0
      ? usersArray.filter((value) => value.cnic === cnic)
      : false;
  console.log("Verify: " + _verify.length);
  if (_verify.length > 0) {
    return res
      .status(400)
      .json({ message: "User already exist", status: false });
  }

  next();
};

// Sign Up
app.post(
  "/user/signup",
  upload.single("image"),
  verifyUserCredentials,
  async (req, res) => {
    const { cnic, password } = req.body;

    const usersArray = await getData("Users.json");
    const newUser = { cnic: cnic, password: password };
    usersArray.push(newUser);
    console.log(usersArray);

    const updatedUsersData = JSON.stringify(usersArray);
    await fs.writeFile("Users.json", updatedUsersData);

    return res
      .status(200)
      .json({ message: "Successful Registration", status: true });
  }
);

// Login
app.post("/user/login", async (req, res) => {
  const { cnic, password, expoToken } = req.body;
  const usersArray = await getData("Users.json");

  let login = false;
  usersArray.forEach((element) => {
    console.log(element);
    console.log(cnic, password);
    if (element.cnic === cnic && element.password === password) login = true;
  });

  if (!login)
    return res
      .status(400)
      .json({ message: "Authentication Failed", status: false });
  else {
    let isAdmin = false;
    if (cnic === "42101-1234567-8") isAdmin = true;
    else {
      const entries = await getData("UsersToken.json");
      const newEntry = { cnic: cnic, expoToken: expoToken };
      console.log(expoToken);
      if (entries?.length === 0) {
        entries.push(newEntry);
      } else {
        const existingEntry = entries.find(
          (entry) => entry.cnic === newEntry.cnic
        );
        console.log("Existing Entries-------- ", existingEntry);
        if (existingEntry) {
          existingEntry.expoToken = newEntry.expoToken;
        } else {
          entries.push(newEntry);
        }
      }
      await fs.writeFile("UsersToken.json", JSON.stringify(entries));
    }

    return res.status(202).json({
      message: "Authentication Successfull",
      isAdmin: isAdmin,
      status: true,
    });
  }
});

// getElections
app.get("/elections", async (req, res) => {
  const elections = await getData("Elections.json");

  let _election = [];
  elections.forEach((element) => {
    if (element.completed === false) {
      _election.push(element.election);
    }
  });

  return res.status(202).json({ elections: _election });
});

const isVoteAlreadyCasted = async (filePath, userCnic, election) => {
  const voteCasted = await getData(filePath);
  if (voteCasted.length === 0) return false;

  let userVoteCasted = voteCasted.filter(
    (vote) => vote.cnic === userCnic && vote.election === election
  );
  console.log("UserVotedAlready Casted ", userCnic, userVoteCasted);
  if (userVoteCasted.length > 0) {
    console.log(`UserVote ${userCnic} ,,, ${userVoteCasted}`);
    return true;
  } else return false;
};

// user's election
app.post("/user/getelectionparties", async (req, res) => {
  const { election, userCnic } = req.body;
  console.log(election, userCnic);
  const user = NadraUserDatabase.filter((users) => users.cnic === userCnic);
  const voteCasted = await isVoteAlreadyCasted(
    "./Voting.json",
    userCnic,
    election
  );
  if (voteCasted) {
    console.log("IsVote is true here");
    return res
      .status(404)
      .json({ message: "Vote already casted.", status: false });
  }

  const elections = await getData("Elections.json");
  let filterElection = elections.filter(
    (_election) => _election.election === election
  );

  const electorals = await getData("Electorals.json");

  let electionPartyList = [];

  for (let index = 0; index < filterElection[0].parties.length; index++) {
    let party = filterElection[0].parties[index];
    let _electoral = electorals.filter((elec) => elec.abbreviation === party);
    for (let area = 0; area < _electoral[0]?.areas?.length; area++) {
      let location = _electoral[0].areas[area];
      if (location === user[0].area) {
        electionPartyList.push(party);
        break;
      }
    }
  }
  console.log(JSON.stringify(electionPartyList));
  return res
    .status(202)
    .json({ electionParties: JSON.stringify(electionPartyList), status: true });
});

// user's vote caste
app.post("/user/vote", async (req, res) => {
  const { userCnic, election, party } = req.body;
  const voteCasted = await isVoteAlreadyCasted(
    "./Voting.json",
    userCnic,
    election
  );
  if (voteCasted)
    return res
      .status(404)
      .json({ message: "Vote already casted.", status: false });

  const vote = await getData("Voting.json");

  vote.push({ cnic: userCnic, election, party });

  await fs.writeFile("Voting.json", JSON.stringify(vote));

  return res
    .status(200)
    .json({ message: "Vote Casted Succesfully", status: true });
});

// election parties
app.get("/parties", async (req, res) => {
  const parties = await getData("Electorals.json");

  let partiesList = [];

  parties?.forEach((party) => {
    partiesList.push(party?.abbreviation);
  });

  return res.status(200).json({ partiesList: JSON.stringify(partiesList) });
});

// getPartyDetails
app.get("/parties/:party", async (req, res) => {
  const { party } = req.params;
  console.log(party);
  const parties = await getData("Electorals.json");
  const partyData = parties.filter((_party) => _party.abbreviation === party);
  return res.status(200).json({ party: partyData[0] });
});

app.get("/user/:cnic", (req, res) => {
  const { cnic } = req.params;
  const user = NadraUserDatabase.filter((value) => value.cnic === cnic);
  return res.status(200).json({ user: JSON.stringify(user) });
});

app.post("/admin/result", async (req, res) => {
  try {
    const { election } = req.body;

    const votes = await getData("Voting.json");
    const winner = {};

    votes?.forEach((vote) => {
      if (vote?.election === election) {
        if (winner[vote.party]) {
          winner[vote.party] += 1;
        } else {
          winner[vote.party] = 1;
        }
      }
    });

    const maxVotes = Math.max(...Object.values(winner));
    const winningParty = Object.entries(winner).reduce(
      (maxKey, [key, value]) => {
        if (value === maxVotes) {
          return key;
        }
        return maxKey;
      },
      null
    );

    const elections = await getData("Elections.json");
    const existingEntry = elections.find((elec) => elec.election === election);

    if (existingEntry) {
      existingEntry.result = winningParty;
      existingEntry.completed = true;
      await fs.writeFile(
        "./Elections.json",
        JSON.stringify(elections, null, 2)
      );
    }

    const tokens = await getData("UsersToken.json");

    const messages = tokens.map((pushToken) => {
      if (!Expo.isExpoPushToken(pushToken.expoToken)) {
        console.error(
          `Push token ${pushToken.expoToken} is not a valid Expo push token`
        );
        return null;
      }

      return {
        to: pushToken.expoToken,
        sound: "default",
        title: "Election Result",
        body: `${election} winner is ${winningParty} with ${maxVotes} votes.`,
      };
    });

    const filteredMessages = messages.filter((message) => message !== null);
    const chunks = expo.chunkPushNotifications(filteredMessages);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log(ticketChunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error(error);
      }
    }

    return res.status(200).json({ status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: "Server Error" });
  }
});

app.get("/election/result", async (req, res) => {
  const elections = await getData("Elections.json");

  let _election = [];
  elections.forEach((element) => {
    if (element.completed === true) {
      const obj = {
        election: element.election,
        winner: element.result,
      };
      _election.push(obj);
    }
  });

  return res.status(200).json({ result: JSON.stringify(_election) });
});

module.exports = app;
