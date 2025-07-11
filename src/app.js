import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, doc, setLogLevel } from 'firebase/firestore';

// --- Helper Components ---

// A reusable component for displaying summary figures
const StatCard = ({ title, amount, colorClass, icon }) => (
    <div className="bg-white p-6 rounded-2xl shadow-md flex flex-col items-start">
        <div className="flex items-center justify-between w-full mb-2">
            <h3 className="text-lg font-semibold text-gray-500">{title}</h3>
            <div className={`text-2xl ${colorClass}`}>{icon}</div>
        </div>
        <p className={`text-4xl font-bold ${colorClass}`}>
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)}
        </p>
    </div>
);

// A reusable input form for adding new budget items
const AddItemForm = ({ type, onAddItem, loading }) => {
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!description || !amount) {
            alert("Please fill out both description and amount.");
            return;
        }
        onAddItem({ description, amount: parseFloat(amount), type });
        setDescription('');
        setAmount('');
    };

    const isIncome = type === 'income';
    const accentColor = isIncome ? 'green' : 'red';

    return (
        <div className="bg-white p-6 rounded-2xl shadow-md">
            <h3 className={`text-2xl font-bold mb-4 text-gray-800 border-b-2 border-${accentColor}-500 pb-2`}>
                Add New {isIncome ? 'Income' : 'Expense'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor={`description-${type}`} className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                    <input
                        id={`description-${type}`}
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={isIncome ? 'e.g., Paycheck' : 'e.g., Groceries'}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition"
                        required
                    />
                </div>
                <div>
                    <label htmlFor={`amount-${type}`} className="block text-sm font-medium text-gray-600 mb-1">Amount</label>
                    <input
                        id={`amount-${type}`}
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition"
                        min="0.01"
                        step="0.01"
                        required
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-3 px-4 text-white font-semibold rounded-lg transition ${loading ? `bg-${accentColor}-300` : `bg-${accentColor}-500 hover:bg-${accentColor}-600`} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-${accentColor}-500`}
                >
                    {loading ? 'Adding...' : `Add ${isIncome ? 'Income' : 'Expense'}`}
                </button>
            </form>
        </div>
    );
};

// A component to display a list of budget items
const ItemList = ({ title, items, onDeleteItem, loading, colorClass }) => (
    <div className="bg-white p-6 rounded-2xl shadow-md">
        <h3 className={`text-2xl font-bold mb-4 text-gray-800 border-b-2 ${colorClass} pb-2`}>{title}</h3>
        <div className="space-y-3 h-96 overflow-y-auto pr-2">
            {loading && <p className="text-gray-500">Loading items...</p>}
            {!loading && items.length === 0 && <p className="text-gray-500 italic">No items yet.</p>}
            {items.map(item => (
                <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg animate-fade-in">
                    <span className="text-gray-700 capitalize">{item.description}</span>
                    <div className="flex items-center space-x-4">
                        <span className="font-medium text-gray-800">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.amount)}
                        </span>
                        <button
                            onClick={() => onDeleteItem(item.id)}
                            className="text-red-500 hover:text-red-700 transition"
                            aria-label={`Delete ${item.description}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            ))}
        </div>
    </div>
);


// --- Main App Component ---

export default function App() {
    // Firebase and Auth State
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // App State
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    / --- Firebase Initialization and Authentication ---
useEffect(() => {
    // These variables are read from the Netlify environment
    const appId = process.env.REACT_APP_ID || 'default-app-id';
    const firebaseConfig = process.env.REACT_APP_FIREBASE_CONFIG ? JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG) : null;

    if (!firebaseConfig) {
        setError("Firebase configuration is missing. Make sure it's set in Netlify.");
        setLoading(false);
        return;
    }

    try {
        const app = initializeApp(firebaseConfig);
        const firestoreDb = getFirestore(app);
        const authInstance = getAuth(app);

        setLogLevel('debug');

        setDb(firestoreDb);
        setAuth(authInstance);

        const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                // For a deployed app, anonymous sign-in is a good default
                try {
                    await signInAnonymously(authInstance);
                } catch (authError) {
                    console.error("Authentication Error:", authError);
                    setError("Failed to authenticate. Please refresh the page.");
                }
            }
            setIsAuthReady(true);
        });

        return () => unsubscribe();

    } catch (e) {
        console.error("Firebase Initialization Error:", e);
        setError("Could not connect to the database.");
        setLoading(false);
    }
}, []);

    // --- Firestore Data Fetching ---
    useEffect(() => {
        // Ensure we have a database connection and user is authenticated
        if (!db || !isAuthReady || !userId) return;

        setLoading(true);
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const collectionPath = `artifacts/${appId}/public/data/budget-items`;
        const itemsCollection = collection(db, collectionPath);
        const q = query(itemsCollection, orderBy('createdAt', 'desc'));

        // onSnapshot creates a real-time listener
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedItems = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setItems(fetchedItems);
            setLoading(false);
        }, (err) => {
            console.error("Firestore Error:", err);
            setError("Failed to fetch budget items.");
            setLoading(false);
        });

        // Cleanup the listener when the component unmounts or dependencies change
        return () => unsubscribe();

    }, [db, isAuthReady, userId]);

    // --- Data Manipulation Functions ---
    const handleAddItem = async (item) => {
        if (!db) return;
        setLoading(true);
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const collectionPath = `artifacts/${appId}/public/data/budget-items`;
            await addDoc(collection(db, collectionPath), {
                ...item,
                createdAt: serverTimestamp(),
                authorId: userId // Track who added the item
            });
        } catch (err) {
            console.error("Error adding document: ", err);
            setError("Could not add the item.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteItem = async (id) => {
        if (!db) return;
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const docPath = `artifacts/${appId}/public/data/budget-items/${id}`;
            await deleteDoc(doc(db, docPath));
        } catch (err) {
            console.error("Error deleting document: ", err);
            setError("Could not delete the item.");
        }
    };

    // --- Calculations ---
    const { totalIncome, totalExpenses, balance, incomeItems, expenseItems } = useMemo(() => {
        const incomeItems = items.filter(item => item.type === 'income');
        const expenseItems = items.filter(item => item.type === 'expense');

        const totalIncome = incomeItems.reduce((sum, item) => sum + item.amount, 0);
        const totalExpenses = expenseItems.reduce((sum, item) => sum + item.amount, 0);

        return {
            totalIncome,
            totalExpenses,
            balance: totalIncome - totalExpenses,
            incomeItems,
            expenseItems
        };
    }, [items]);

    // --- Render Logic ---
    if (error) {
        return <div className="h-screen flex items-center justify-center bg-red-50 text-red-700 text-xl">{error}</div>;
    }

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
                body { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
                @keyframes fade-in { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
                /* Custom scrollbar for item lists */
                .overflow-y-auto::-webkit-scrollbar { width: 8px; }
                .overflow-y-auto::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
                .overflow-y-auto::-webkit-scrollbar-thumb { background: #888; border-radius: 10px; }
                .overflow-y-auto::-webkit-scrollbar-thumb:hover { background: #555; }
            `}</style>
            <div className="min-h-screen p-4 sm:p-6 lg:p-8">
                <header className="text-center mb-8">
                    <h1 className="text-5xl font-extrabold text-gray-800">Our Budget</h1>
                    <p className="text-gray-500 mt-2">A real-time shared budget for you and your partner.</p>
                     {userId && <p className="text-xs text-gray-400 mt-2">Your User ID: {userId}</p>}
                </header>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <StatCard title="Total Income" amount={totalIncome} colorClass="text-green-500" icon="➕" />
                    <StatCard title="Total Expenses" amount={totalExpenses} colorClass="text-red-500" icon="➖" />
                    <StatCard title="Balance" amount={balance} colorClass={balance >= 0 ? 'text-blue-500' : 'text-yellow-500'} icon="=" />
                </div>

                {/* Main Content: Forms and Lists */}
                <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Income Section */}
                    <div className="space-y-6">
                        <AddItemForm type="income" onAddItem={handleAddItem} loading={loading} />
                        <ItemList title="Income History" items={incomeItems} onDeleteItem={handleDeleteItem} loading={loading} colorClass="border-green-500" />
                    </div>

                    {/* Expenses Section */}
                    <div className="space-y-6">
                        <AddItemForm type="expense" onAddItem={handleAddItem} loading={loading} />
                        <ItemList title="Expense History" items={expenseItems} onDeleteItem={handleDeleteItem} loading={loading} colorClass="border-red-500" />
                    </div>
                </main>
            </div>
        </>
    );
}
