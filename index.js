const express = require("express");
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;
const app = express();

//middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("server is running ");
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.absippg.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const classCollocation = client.db("Sports-Mentor").collection("class");
    const usersCollocation = client.db("Sports-Mentor").collection("users");
    const instructorCollocation = client
      .db("Sports-Mentor")
      .collection("instructor");

    const updateInstructor = async (id) => {
      const instructor = await usersCollocation.findOne({
        _id: new ObjectId(id),
      });
      const classId = await classCollocation
        .find(
          { email: instructor.email },
          { projection: { _id: 1, enrollStudentId: 1 } }
        )
        .toArray();
      const instructorObj = {
        name: instructor.name,
        email: instructor.email,
        photo: instructor.photo,
        allClass: classId.map((id) => id._id),
        allStudent: classId.reduce(
          (sum, id) => sum + id.enrollStudentId.length,
          0
        ),
      };
      const result = await instructorCollocation.insertOne(instructorObj);
      console.log(instructorObj);
    };
    // users collection
    app.post("/add-users", async (req, res) => {
      const userData = req.body;
      console.log(userData);
      const existUser = await usersCollocation.findOne({
        email: userData.email,
      });
      if (existUser) {
        return res.send({ message: "user already exist" });
      }
      const result = await usersCollocation.insertOne(userData);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const email = req.query.email;
      const result = await usersCollocation.findOne({ email }).toArray();
      res.send(result);
    });

    app.get("/all-users", async (req, res) => {
      const result = await usersCollocation.find().toArray();
      res.send(result);
    });

    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const { roll } = req.body;
      if (roll === "instructor") {
        updateInstructor(id);
      }
      const query = { _id: new ObjectId(id) };
      // const options = { upsert: true };
      console.log(id, roll);
      const updateDoc = {
        $set: {
          roll: roll,
        },
      };
      const result = await usersCollocation.updateOne(query, updateDoc);
      res.send(result);
    });

    // class api
    app.post("/add-class", async (req, res) => {
      const classData = req.body;
      const result = await classCollocation.insertOne(classData);
      res.send(result);
    });

    app.get("/top-class", async (req, res) => {
      const result = await classCollocation
        .find()
        .sort({ enrollStudent: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // instructor collection
    app.get("/popular-instructor", async (req, res) => {
      const result = await instructorCollocation
        .find()
        .sort({ allStudent: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/instructor", async (req, res) => {
      const result = await instructorCollocation.find().toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.listen(port);
