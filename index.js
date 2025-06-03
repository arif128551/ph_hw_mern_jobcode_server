require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 3000;

app.use(
	cors({
		origin: ["http://localhost:5173"],
		credentials: true,
	})
);
app.use(express.json());

app.use(cookieParser());

const logger = (req, res, next) => {
	console.log("Inside the logger");
	next();
};

const verifyToken = (req, res, next) => {
	const token = req?.cookies?.token;
	console.log("cookies in middleware", token);
	if (!token) {
		return res.status(401).send({ message: "Unauthorized access" });
	}
	jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
		if (err) {
			return res.status(401).send({ message: "Unauthorized access" });
		}
		req.decoded = decoded;
		next();
	});
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.x7tmnab.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});

async function run() {
	try {
		await client.connect();

		const careerDatabase = client.db("career-code");
		const jobsCollection = careerDatabase.collection("jobs");
		const applicationsCollection = careerDatabase.collection("application");

		app.post("/jwt", async (req, res) => {
			const { email } = req.body;
			const user = { email };
			const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "1h" });
			res.cookie("token", token, {
				httpOnly: true,
				secure: false,
			});
			res.send({ token });
		});

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

		app.get("/api/my-applications", logger, verifyToken, async (req, res) => {
			const email = req.query.email;
			if (email !== req.decoded.email) {
				return res.status(401).send({ message: "Unauthorized access" });
			}
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
