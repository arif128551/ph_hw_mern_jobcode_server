require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");
const serviceAccount = require("./firebase-access-token.json");

const app = express();
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.x7tmnab.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
});

const verifyFirebaseToken = async (req, res, next) => {
	const authHeader = req.headers?.authorization;
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return res.status(401).send({ message: "Unauthorized access" });
	}

	const token = authHeader.split(" ")[1];
	try {
		const decoded = await admin.auth().verifyIdToken(token);
		req.decoded = decoded;
	} catch (error) {
		return res.status(401).send({ message: "Unauthorized access" });
	}

	next();
};

const verifyTokenEmail = async (req, res, next) => {
	const email = req.query.email;
	if (email !== req.decoded.email) {
		return res.status(401).send({ message: "Forbidden access" });
	}
	next();
};

async function run() {
	try {
		await client.connect();

		const careerDatabase = client.db("career-code");
		const jobsCollection = careerDatabase.collection("jobs");
		const applicationsCollection = careerDatabase.collection("application");

		// app.post("/jwt", async (req, res) => {
		// 	const { email } = req.body;
		// 	const user = { email };
		// 	const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "1h" });
		// 	res.cookie("token", token, {
		// 		httpOnly: true,
		// 		secure: false,
		// 	});
		// 	res.send({ token });
		// });

		app.get("/api/jobs/featured", async function (req, res) {
			const result = await jobsCollection.find().limit(8).toArray();
			res.send(result);
		});

		app.get("/api/jobs", async function (req, res) {
			const email = req.query.email;
			let query = {};
			if (email) {
				query = {
					hr_email: email,
				};
			}
			const result = await jobsCollection.find(query).toArray();
			res.send(result);
		});

		app.get("/api/jobs/:id", async (req, res) => {
			const id = req.params.id;
			const query = {
				_id: new ObjectId(id),
			};

			const job = await jobsCollection.findOne(query);
			res.send(job);
		});

		// app.get("/api/my-posted-jobs", async (req, res) => {
		// 	const email = req.query.email;
		// 	const query = {
		// 		hr_email: email,
		// 	};
		// 	const myJobs = await jobsCollection.find(query).toArray();
		// 	res.send(myJobs);
		// });

		app.post("/api/jobs/add", async (req, res) => {
			const data = req.body;
			const result = await jobsCollection.insertOne(data);
			res.send(result);
		});

		app.get("/api/applications/job/:jobId", async (req, res) => {
			const jobId = req.params.jobId;
			const query = {
				jobId,
			};
			const result = await applicationsCollection.find(query).toArray();
			res.send(result);
		});

		app.patch("/api/applications/status/:id", async (req, res) => {
			const applicationId = req.params.id;
			const filter = {
				_id: new ObjectId(applicationId),
			};
			const updatedDoc = {
				$set: {
					status: req.body.status,
				},
			};
			const result = await applicationsCollection.updateOne(filter, updatedDoc);
			res.send(result);
		});

		app.get("/api/my-applications", verifyFirebaseToken, verifyTokenEmail, async (req, res) => {
			const email = req.query.email;

			const query = {
				email,
			};

			const applications = await applicationsCollection.find(query).toArray();

			if (applications.length === 0) return res.send([]);

			const jobIds = applications.map((application) => new ObjectId(application.jobId));

			const jobs = await jobsCollection
				.find(
					{ _id: { $in: jobIds } },
					{
						projection: {
							title: 1,
							company: 1,
							company_logo: 1,
							location: 1,
							jobType: 1,
						},
					}
				)
				.toArray();

			const mergedApplications = applications.map((application) => {
				const job = jobs.find((job) => job._id.toString() === application.jobId);
				return {
					...application,
					job: job || null,
				};
			});
			res.send(mergedApplications);
		});

		app.post("/api/jobs/application", async (req, res) => {
			const data = req.body;
			const result = await applicationsCollection.insertOne(data);
			res.send(result);
		});

		await client.db("admin").command({ ping: 1 });
		console.log("Pinged your deployment. You successfully connected to MongoDB!");
	} finally {
		// await client.close();
	}
}
run().catch(console.dir);

app.listen(port, () => {
	console.log(`Example app listening on port ${port}`);
});
