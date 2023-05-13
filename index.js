const express = require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const app = express()
const cors = require('cors');
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);// stripe payment intent api er jonne
//https://sendgrid.com/blog/sending-email-nodemailer-sendgrid/ ekhan theke egula  require korsi
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');

const port = process.env.PORT || 5000
function verifyJwt(req, res, next) {
    const authHeader = req.headers.authorization //client side theke je header pathaisi sheta read korbo
    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded //je data ta token er moddhe ase sheta amra  decoded er moddhe pabo
        next()
    });

}

// emailSenderOptions and  emailClient ei 2 ta jinish obosshoi function er bahire likhte hobe
const emailSenderOptions = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY
    }
}

const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));

function sendAppointmentEmail(booking) {
    const { patient, patientEmail, treatment, date, slot } = booking;

    //booking korle user er email e ekta mail jabe sheta korar way:
    var email = {
        from: process.env.EMAIL_SENDER,
        to: patientEmail, //email ta patient er email e  jabe
        subject: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed`,
        text: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed`,
        html: `
        <div>
          <p> Hello ${patient}, </p>
          <h3>Your Appointment for ${treatment} is confirmed</h3>
          <p>Looking forward to seeing you on ${date} at ${slot}.</p>
          
          <h3>Our Address</h3>
          <p>Andor Killa Bandorban</p>
          <p>Bangladesh</p>
          <a href="https://web.programming-hero.com/">unsubscribe</a>
        </div>
      `
    };
    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    });

}

//payment korle user er mail e payment  confirmation email jabe
function sendPaymentConfirmationEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking;

    var email = {
        from: process.env.EMAIL_SENDER,
        to: patientEmail,
        subject: `We have received your payment for ${treatment} is on ${date} at ${slot} is Confirmed`,
        text: `Your payment for this Appointment ${treatment} is on ${date} at ${slot} is Confirmed`,
        html: `
        <div>
          <p> Hello ${patient}, </p>
          <h3>Thank you for your payment . </h3>
          <h3>We have received your payment</h3>
          <p>Looking forward to seeing you on ${date} at ${slot}.</p>
          <h3>Our Address</h3>
          <p>Andor Killa Bandorban</p>
          <p>Bangladesh</p>
          <a href="https://web.programming-hero.com/">unsubscribe</a>
        </div>
      `
    };

    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    });

}


//middleware
app.use(express.json())
app.use(cors())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4bhu5.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        //user login or signup korle tar info rakhbo ekhane:
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');
        const paymentCollection = client.db('doctors_portal').collection('payments');

        //admin na hole  new doctor add korte dibo na etar middleware:
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        //shob service load korar backend api:
        app.get('/service', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query).project({ name: 1 }) //.project({ name: 1 }) er mane holo database er shbkisu load  na kore shuhdu  name er feild taload korbe.ar 1 deya mane holo true.
            const services = await cursor.toArray()
            res.send(services)
        })
        //jeshb user signup and login korse  shashokol user ke load  korar backend api:
        app.get('/user', verifyJwt, async (req, res) => {
            const users = await userCollection.find().toArray()
            res.send(users)
        })
        //je admin na take amra Alluser button  tai dekhabo na etar backend api:
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        //user signup korle create korbo  ar login korle update korbo  etar backend api:
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email: email }//email diye amra user take khujbo
            const options = { upsert: true }
            const updatedoc = {
                //set er moddhe user related info thakbe.ei info amra body theke nibo
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updatedoc, options)
            //prothom value({ email: email }) ta hocche playload,mane ei info ta amra rakhte chay.
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ result, token })
        })
        //make admin e click korle user take admin banano hobe shetar backend api:
        app.put('/user/admin/:email', verifyJwt, async (req, res) => {
            const email = req.params.email
            const requester = req.decoded.email; //je user ta req patacche tar info verifyJWT er vitor decoded hishebe ase
            //je user ta req pathaise tar role ta ki sheta amra check korbo.jodi admin hoy tahole ekta kaaj korbo ar naile arekta kaaj
            const requesterAccount = await userCollection.findOne({ email: requester });//user ta notun or puran jaihok amader database e sha ase.tai amra check kortesi user ta ke?
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
            //    const filter = { email: email }
            //     const updatedoc = {
            //         $set: { role: 'admin' },
            //     };
            //     const result = await userCollection.updateOne(filter, updatedoc)
            //     res.send(result,)
        })
        //booking korar por  1 ta booking slot kome jabe etar backend api:
        app.get('/available', async (req, res) => {
            const date = req.query.date || 'May 14, 2022' //buji nai
            const services = await serviceCollection.find().toArray() //get all services

            //get the booking of that day
            const query = { date: date }
            const bookings = await bookingCollection.find(query).toArray() //jegula booking deya shagula dekhabe

            // services.forEach(service => {
            //     const serviceBookings = bookings.filter(b => b.treatment === service.name)
            //     const booked = serviceBookings.map(s => s.slot)
            //     //service.booked = booked
            //     const available = service.slots.filter(s => !booked.includes(s))
            //     service.available = available //buji nai
            // })
            services.forEach(service => {
                // step 4: find bookings for that service. output: [{}, {}, {}, {}]
                // jdoi booking er treatment er name service er name er sathe mile jai tahole oi booking tai hocche ei service er jonne
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                // step 5: select slots for the serviceBookings: ['', '', '', '']
                const bookedSlots = serviceBookings.map(book => book.slot);
                // step 6: select those slots that are not in bookedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                //step 7: set available to slots to make it easier 
                //available slot guli ke alada slot hishebe pathai dibo,tahole client side e 2ta array jabe ekta hocche jotogula slot  ase  sheta second hocche available slot guli.2ta array na pathaite chaile service.slots = available; pathai dibo
                service.slots = available;
            });

            res.send(services)
        })
        app.get('/booking', verifyJwt, async (req, res) => {
            const patientEmail = req.query.patientEmail//search query hishebe pathaisi tai evabe email ta read korbo
            const decodedEmail = req.decoded.email
            //amar kache ekta valid token ase ,ei token diye ami tomar info pete chay eta thekanor niyom: 
            if (patientEmail === decodedEmail) {
                const query = { patientEmail: patientEmail }
                const bookings = await bookingCollection.find(query).toArray()
                res.send(bookings)
            }
            else {
                return res.status(403).send({ message: 'forbidden access' })
            }
        })

        //specific id  wala service ke load korar backend api:
        app.get('/booking/:id', verifyJwt, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        })

        //booking update korar backend api,shudhu update korar jonne patch use kora hoy: 
        //booking  korle sheta databse  e jabe
        app.patch('/booking/:id', verifyJwt, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
            res.send(updatedBooking);
        })



        //booking korar por booking er info database e pathanor backend api:
        app.post('/booking', async (req, res) => {
            const booking = req.body
            //eki user eki treatment ekadikbar booking dite parbe na.tai treatment ,date,patientEmail diye filter kortesi same booking already database e ase kina
            const query = { treatment: booking.treatment, date: booking.date, patientEmail: booking.patientEmail }
            const exists = await bookingCollection.findOne(query)
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking)
            console.log('sending email');
            sendAppointmentEmail(booking)//booking korle user er email e mail jabe etar function ekhane call kore hoise
            res.send({ success: true, result })
        })

        //doctor collection theke shb doctor load korar backend api:
        app.get('/doctor', verifyJwt, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        })

        //new doctor add korar backend api:
        app.post('/doctor', verifyJwt, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        });

        //doctor delete korar backend api:
        app.delete('/doctor/:email', verifyJwt, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }; //kare delete korbo tare khuje anbe 
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        })

        //payment  intent er backend api:
        app.post('/create-payment-intent', verifyJwt, async (req, res) => {
            const service = req.body; //service er  info ta body er moddhe pathai dibo
            const price = service.price; //erpr service theke price er info ta nibo
            const amount = price * 100; //koto tk katbo sheta client side theke bole dite hobe and obosshoi poishai convert kore nite hobe
            const paymentIntent = await stripe.paymentIntents.create({
                //paymenty intent er kache kichu info pathaite hobe:
                amount: amount, //koto  amount pathabo sheta
                currency: 'usd',//dollar e tk katbe
                payment_method_types: ['card'] //ekadik method hote pare but apatwtw card diye payment hobe
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });


    }
    finally {

    }

}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`doctor portal server ${port}`)
})