const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
const app = express();

//middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("server is running ");
});

app.post("/jwt", (req, res) => {
  const userInfo = req.body;
  const token = jwt.sign(userInfo, process.env.JWT_SECRET, {
    expiresIn: "10h",
  });
  res.send({ token });
});

const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;
  const token = authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ error: true, message: "token undefined" });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: "unveiled token" });
    }
    req.headers.decoder = decoded;
    next();
  });
};

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
    const bookingClassCollocation = client
      .db("Sports-Mentor")
      .collection("bookingClass");
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

    const verifyAdmin = async (req, res, next) => {
      const email = req.headers.decoder.email;
      const user = await usersCollocation.findOne({ email });
      console.log(user.roll);
      if (user.roll !== "admin") {
        return res
          .status(401)
          .send({ error: true, message: "unauthorize access" });
      }
      next();
    };

    const verifyInstructor = async (req, res, next) => {
      const email = req.headers.decoder.email;
      const user = await usersCollocation.findOne({ email });
      console.log(user.roll);
      if (user.roll !== "instructor") {
        return res
          .status(401)
          .send({ error: true, message: "unauthorize access" });
      }
      next();
    };

    // ---------------------
    // users collection
    // ---------------------------
    app.post("/add-users", async (req, res) => {
      const userData = req.body;
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
      const result = await usersCollocation.findOne({ email });
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

    // --------------------------------------------------------
    // class api
    //------------------------------------------------------

    app.post("/add-class", verifyJwt, verifyInstructor, async (req, res) => {
      const classData = req.body;
      const result = await classCollocation.insertOne(classData);
      const instructorEmail = req.headers.decoder?.email;
      const instructor = await instructorCollocation.findOne({
        email: instructorEmail,
      });
      console.log(instructor, instructorEmail);
      const allClassPrev = instructor.allClass;
      const newClass = result.insertedId;
      const insClass = [...allClassPrev, newClass];
      console.log(insClass);
      const updateDoc = {
        $set: {
          allClass: insClass,
        },
      };
      const updateResult = await instructorCollocation.updateOne(
        {
          email: instructorEmail,
        },
        updateDoc
      );
      res.send({ result, updateResult });
    });

    app.get("/top-class", async (req, res) => {
      const result = await classCollocation
        .find({ status: "approved" })
        .sort({ enrollStudent: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.patch("/classes/:id", verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      // const options = { upsert: true };
      const updateDoc = {
        $set: {
          status: status,
        },
      };
      const result = await classCollocation.updateOne(query, updateDoc);
      res.send(result);
    });

    app.get("/all-class", async (req, res) => {
      const result = await classCollocation
        .find()
        .sort({ postTime: -1 })
        .toArray();
      res.send(result);
    });
    // --------------------------------------------------------------------
    // instructor collection
    // ---------------------------------------------------------------------
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

    // ----------------------------------------------------------------------------
    // bookingClassCollocation api
    // -----------------------------------------------------------------------------

    app.post("/booking", async (req, res) => {
      const bookingData = req.body;
      const result = await bookingClassCollocation.insertOne(bookingData);
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
