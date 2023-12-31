const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
const app = express();
const stripe = require("stripe")(process.env.PAY_KEY);

//middleware
app.use(express.json());
app.use(cors());

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
  if (!authorization) {
    return res.status(401).send({ error: true, message: "token undefined" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: "unveiled token" });
    }
    req.decoder = decoded;
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
    const payHistoryCollocation = client
      .db("Sports-Mentor")
      .collection("payHistory");
    const enrollClassCollocation = client
      .db("Sports-Mentor")
      .collection("enrollClass");
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
      const email = req.decoder.email;
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
      const email = req.decoder.email;
      const user = await usersCollocation.findOne({ email });
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
      const instructorEmail = req.decoder?.email;
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
        .aggregate([
          {
            $addFields: {
              enrollStudentIdCount: { $size: "$enrollStudentId" },
            },
          },
          {
            $sort: { enrollStudentIdCount: -1 },
          },
        ])
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.patch("/feedback/class/:id", async (req, res) => {
      const id = req.params.id;
      const feedback = req.body;
      console.log(feedback);
      const option = { upsert: true };
      const result = await classCollocation.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            feedback: feedback,
          },
        },
        option
      );
      res.send(result);
    });

    app.patch("/all-class/:id", async (req, res) => {
      const id = req.params.id;
      const updateDoc = req.body;
      const result = await classCollocation.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            className: updateDoc.className,
            price: updateDoc.price,
            availableSeats: updateDoc.availableSeats,
          },
        }
      );
      res.send(result);
    });

    app.get("/all-class/:id", verifyJwt, verifyInstructor, async (req, res) => {
      const id = req.params.id;
      const result = await classCollocation.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.patch("/class-status/:id", verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      console.log(status);
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

    app.get("/inst-class", verifyJwt, verifyInstructor, async (req, res) => {
      const email = req.query.email;
      const result = await classCollocation.find({ email: email }).toArray();
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

    app.get("/booking/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;
      if (req.decoder.email !== email) {
        return res
          .status(401)
          .send({ error: true, message: "email not match" });
      }
      const result = await bookingClassCollocation
        .find({ studentEmail: email })
        .sort({ selectTime: -1 })
        .toArray();
      res.send(result);
    });
    app.get("/payment/booking/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const result = await bookingClassCollocation.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });
    app.post("/booking", verifyJwt, async (req, res) => {
      const bookingData = req.body;
      console.log(bookingData);
      const classId = bookingData.classId;

      // const updateCls = await classCollocation.updateOne(
      //   { _id: new ObjectId(classId) },
      //   { $push: { enrollStudentId: bookingData.studentEmail } }
      // );
      const result = await bookingClassCollocation.insertOne(bookingData);
      res.send(result);
    });

    app.delete("/booking/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;

      // const updateCls = await classCollocation.updateOne(
      //   { _id: new ObjectId(classId) },
      //   { $push: { enrollStudentId: bookingData.studentEmail } }
      // );
      const result = await bookingClassCollocation.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // ----------------------------------------------------------------------------
    // enrollClassCollocation api
    // -----------------------------------------------------------------------------

    app.get("/enroll/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;
      if (req.decoder.email !== email) {
        return res
          .status(401)
          .send({ error: true, message: "email not match" });
      }
      const result = await enrollClassCollocation
        .find({ studentEmail: email })
        .sort({ selectTime: -1 })
        .toArray();
      res.send(result);
    });

    // ------------------------------------
    // payments
    // ---------------------------------------
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = +price * 100;
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
      const payData = req.body;
      const bookingId = payData.allBookingId;
      const bookingClass = await bookingClassCollocation
        .find({
          _id: { $in: bookingId.map((id) => new ObjectId(id)) },
        })
        .toArray();
      console.log(bookingId, bookingClass);

      // clear booking
      const clearBooking = await bookingClassCollocation.deleteMany({
        _id: { $in: bookingId.map((id) => new ObjectId(id)) },
      });
      const insertEnroll = await enrollClassCollocation.insertMany(
        bookingClass
      );
      const allClassId = payData.allClassId;
      const allInstructor = payData.instructorEmails;
      const options = { upsert: true };
      allClassId.forEach(async (id) => {
        const updateCls = await classCollocation.updateOne(
          { _id: new ObjectId(id) },
          { $push: { enrollStudentId: id } }
        );
      });

      allInstructor.forEach(async (instEmail) => {
        const updateInst = await instructorCollocation.updateOne(
          { email: instEmail },
          {
            $inc: { allStudent: 1 },
          }
        );
      });
      const result = await payHistoryCollocation.insertOne(payData);
      res.send(result);
    });

    app.get("/payment-history", async (req, res) => {
      const email = req.query.email;
      const result = await payHistoryCollocation
        .find({ email: email })
        .sort({ paymentTime: -1 })
        .toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.listen(port);
