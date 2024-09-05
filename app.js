const express = require('express');
const bodyParser = require('body-parser');
const sql = require('mssql');
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); 

app.use(session({
    secret: 'secret-key', 
    resave: false, 
    saveUninitialized: false 
}));
// blank in regards to posting on public repository 
const dbConfig = {
    user: '',
    password: '',
    server: '',
    database: '',
    options: {
        encrypt: true, 
        trustServerCertificate: true 
    }
};

sql.connect(dbConfig).then(() => {
    console.log('Connected to SQL Server');
}).catch(err => {
    console.error('Database connection failed:', err);
});

const upload = multer({ dest: 'uploads/' });

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/documents/index.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/documents/register.html'));
});

app.get('/sign_in', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/documents/sign-in.html'));
});

app.post('/register', async (req, res) => {
    const { name, email, username, password, role } = req.body;

    console.log('Received data:', req.body);

    if (!name || !email || !username || !password || !role) {
        return res.status(400).send('All fields are required.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const usernameRegex = /^[a-zA-Z0-9_]+$/;

    if (!emailRegex.test(email)) {
        return res.status(400).send('Invalid email format.');
    }

    if (!usernameRegex.test(username)) {
        return res.status(400).send('Username can only contain letters, numbers, and underscores.');
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);

        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('name', sql.NVarChar, name)
            .input('email', sql.NVarChar, email)
            .input('username', sql.NVarChar, username)
            .input('passwordHash', sql.NVarChar, passwordHash)
            .input('role', sql.NVarChar, role)
            .query('INSERT INTO Users (Name, Email, Username, PasswordHash, Role) VALUES (@name, @email, @username, @passwordHash, @role)');
        
        console.log('Registration successful');
        res.send('Registration successful. Please sign in.');
    } catch (err) {
        console.error('Registration failed:', err);
        res.status(500).send('An error occurred during registration. Please try again.');
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('username', sql.NVarChar, username)
            .query('SELECT * FROM Users WHERE Username = @username');
        
        const user = result.recordset[0];
        if (!user) {
            return res.status(400).send('Invalid username or password');
        }

        const match = await bcrypt.compare(password, user.PasswordHash);
        if (!match) {
            return res.status(400).send('Invalid username or password');
        }

        req.session.user = user;

        if (user.Role === 'tenant') {
            res.send('/tenant');
        } else if (user.Role === 'propertymanager') {
            res.send('/propertymanager');
        }
    } catch (err) {
        console.error('Login failed:', err);
        res.status(500).send('An error occurred during login. Please try again.');
    }
});

app.get('/get-manager-name', (req, res) => {
    if (!req.session.user || req.session.user.Role !== 'propertymanager') {
        return res.status(403).send('Access denied');
    }

    res.json({ name: req.session.user.Name });
});

app.post('/upload-document', upload.single('document'), async (req, res) => {
    if (!req.session.user) {
        return res.status(403).send('Access denied');
    }

    try {
        const pool = await sql.connect(dbConfig);
        const tenantID = req.session.user.UserID;
        const documentName = req.file.originalname;
        const fileData = fs.readFileSync(req.file.path);

        await pool.request()
            .input('tenantID', sql.Int, tenantID)
            .input('documentName', sql.NVarChar, documentName)
            .input('documentData', sql.VarBinary(sql.MAX), fileData)
            .query('INSERT INTO Documents (TenantID, DocumentName, DocumentData) VALUES (@tenantID, @documentName, @documentData)');

        fs.unlinkSync(req.file.path);

        res.json({ message: 'Document uploaded successfully' });
    } catch (err) {
        console.error('Error uploading document:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/tenant', (req, res) => {
    if (!req.session.user || req.session.user.Role !== 'tenant') {
        return res.status(403).send('Access denied');
    }
    res.sendFile(path.join(__dirname, 'tenant.html'));
});

app.get('/propertymanager', (req, res) => {
    if (!req.session.user || req.session.user.Role !== 'propertymanager') {
        return res.status(403).send('Access denied');
    }
    res.sendFile(path.join(__dirname, 'propertymanager.html'));
});

app.get('/get-tenant-documents', async (req, res) => {
    if (!req.session.user || req.session.user.Role !== 'propertymanager') {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .query('SELECT DocumentID, DocumentName FROM Documents');
        console.log('Documents Retrieved:', result.recordset); 
        res.json(result.recordset);
    } catch (err) {
        console.error('Error retrieving documents:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/download-document/:id', async (req, res) => {
    const documentID = req.params.id;

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('documentID', sql.Int, documentID)
            .query('SELECT DocumentName, DocumentData FROM Documents WHERE DocumentID = @documentID');

        if (result.recordset.length > 0) {
            const document = result.recordset[0];
            res.setHeader('Content-Disposition', 'attachment; filename=' + document.DocumentName);
            res.setHeader('Content-Type', 'application/pdf');
            res.send(document.DocumentData);
        } else {
            res.status(404).send('Document not found');
        }
    } catch (err) {
        console.error('Error downloading document:', err);
        res.status(500).send('Server error');
    }
});

app.post('/send-invite', async (req, res) => {
    const { tenantUsername } = req.body;

    try {
        const pool = await sql.connect(dbConfig);

        const tenantResult = await pool.request()
            .input('username', sql.NVarChar, tenantUsername)
            .query('SELECT UserID FROM Users WHERE Username = @username AND Role = \'tenant\'');

        if (tenantResult.recordset.length === 0) {
            return res.status(404).send('Tenant not found');
        }

        const tenantID = tenantResult.recordset[0].UserID;

        await pool.request()
            .input('propertyManagerID', sql.Int, req.session.user.UserID)
            .input('tenantID', sql.Int, tenantID)
            .query('INSERT INTO Invites (PropertyManagerID, TenantID) VALUES (@propertyManagerID, @tenantID)');

        res.send('Invite sent successfully');
    } catch (err) {
        console.error('Error sending invite:', err);
        res.status(500).send('Server error');
    }
});


app.get('/view-invites', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);

        const invites = await pool.request()
            .input('tenantID', sql.Int, req.session.user.UserID)
            .query('SELECT InviteID, PropertyManagerID, Status, SentDate FROM Invites WHERE TenantID = @tenantID AND Status = \'Pending\'');

        res.json(invites.recordset);
    } catch (err) {
        console.error('Error fetching invites:', err);
        res.status(500).json({ message: 'Server error' });
    }
});


app.post('/respond-invite', async (req, res) => {
    const { inviteID, response } = req.body; 

    try {
        const pool = await sql.connect(dbConfig);

        await pool.request()
            .input('inviteID', sql.Int, inviteID)
            .input('status', sql.NVarChar, response)
            .input('responseDate', sql.DateTime, new Date())
            .query('UPDATE Invites SET Status = @status, ResponseDate = @responseDate WHERE InviteID = @inviteID');

        res.send('Response recorded successfully');
    } catch (err) {
        console.error('Error responding to invite:', err);
        res.status(500).send('Server error');
    }
});


app.get('/get-accepted-tenants', async (req, res) => {
    if (!req.session.user || req.session.user.Role !== 'propertymanager') {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('propertyManagerID', sql.Int, req.session.user.UserID)
            .query(`
                SELECT u.Username 
                FROM Invites i
                JOIN Users u ON i.TenantID = u.UserID
                WHERE i.PropertyManagerID = @propertyManagerID AND i.Status = 'Accepted'
            `);
        
        res.json(result.recordset);
    } catch (err) {
        console.error('Error retrieving tenants:', err);
        res.status(500).json({ message: 'Server error' });
    }
});


app.get('/get-tenant-property', async (req, res) => {
    if (!req.session.user || req.session.user.Role !== 'tenant') {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('tenantID', sql.Int, req.session.user.UserID)
            .query(`
                SELECT PropertyName, Address, Details, LeaseDuration, MonthlyRent
                FROM Properties
                WHERE TenantID = @tenantID
            `);

        res.json(result.recordset[0] || null); 
    } catch (err) {
        console.error('Error retrieving tenant property:', err);
        res.status(500).json({ message: 'Server error' });
    }
});



app.get('/get-properties', async (req, res) => {
    if (!req.session.user || req.session.user.Role !== 'propertymanager') {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('propertyManagerID', sql.Int, req.session.user.UserID)
            .query(`
                SELECT PropertyID, PropertyName, Details, LeaseDuration, MonthlyRent, Latitude, Longitude
                FROM Properties
                WHERE PropertyManagerID = @propertyManagerID
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error retrieving properties:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/add-property', async (req, res) => {
    if (!req.session.user || req.session.user.Role !== 'propertymanager') {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { address, name, details, leaseDuration, monthlyRent, tenantName, lat, lng } = req.body;

    try {
        const pool = await sql.connect(dbConfig);
        const tenantResult = await pool.request()
            .input('username', sql.NVarChar, tenantName)
            .query('SELECT UserID FROM Users WHERE Username = @username');

        const tenantID = tenantResult.recordset.length > 0 ? tenantResult.recordset[0].UserID : null;

        await pool.request()
            .input('propertyManagerID', sql.Int, req.session.user.UserID)
            .input('tenantID', sql.Int, tenantID)
            .input('address', sql.NVarChar, address)
            .input('propertyName', sql.NVarChar, name)
            .input('details', sql.NVarChar, details)
            .input('leaseDuration', sql.NVarChar, leaseDuration)
            .input('monthlyRent', sql.Decimal(18, 2), monthlyRent)
            .input('latitude', sql.Decimal(18, 10), lat)
            .input('longitude', sql.Decimal(18, 10), lng)
            .query(`
                INSERT INTO Properties (PropertyManagerID, TenantID, Address, PropertyName, Details, LeaseDuration, MonthlyRent, Latitude, Longitude)
                VALUES (@propertyManagerID, @tenantID, @address, @propertyName, @details, @leaseDuration, @monthlyRent, @latitude, @longitude)
            `);

        res.json({ message: 'Property added successfully' });
    } catch (err) {
        console.error('Error adding property:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/delete-property/:id', async (req, res) => {
    const propertyID = req.params.id;
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('propertyID', sql.Int, propertyID)
            .query('DELETE FROM Properties WHERE PropertyID = @propertyID');
        
        res.send('Property removed successfully');
    } catch (err) {
        res.status(500).send('Server error');
    }
});

app.get('/monthly-profits', async (req, res) => {
    if (!req.session.user || req.session.user.Role !== 'propertymanager') {
        return res.status(403).send('Access denied');
    }

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('propertyManagerID', sql.Int, req.session.user.UserID)
            .query(`
                SELECT SUM(MonthlyRent) as TotalProfit
                FROM Properties
                WHERE PropertyManagerID = @propertyManagerID
            `);
        
        res.json({ totalProfit: result.recordset[0].TotalProfit });
    } catch (err) {
        console.error('Error retrieving monthly profits:', err);
        res.status(500).send('Server error');
    }
});

app.listen(3001, () => {
    console.log('Server is running on http://localhost:3001');
});
