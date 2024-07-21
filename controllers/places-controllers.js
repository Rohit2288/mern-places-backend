const fs = require('fs');

const { v4: uuidv4 } = require('uuid');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

const HttpError = require('../models/http-error');
const getCoordsForAddress = require('../util/location');
const Place = require('../models/place');
const User = require('../models/user');

// let DUMMY_PLACES = [
//     {
//         id:'p1',
//         title:'Empire State Building',
//         description:'One of the most famous Sky Scrapers in the world!',
//         location:{
//             lat:40.7484474,
//             lng:-73.9871516
//         },
//         address:'20 W 34th St , New York , NY 10001',
//         creator:'u1'
//     }
// ];

const getPlaceById = async(req ,res ,next)=>{
    const placeId = req.params.pid;

    let place;
    try {
        place = await Place.findById(placeId); 
    } catch (err) {
        const error = new HttpError('Something went wrong,could not find a place',500);
        return next(error);
    }
    
    if(!place){
        const error = new HttpError("Could not find a place for the provided id.",404);
        return next(error);    
    }

    res.json({place: place.toObject({getters:true})});// => {place}=>{ place: place}    
};
// function getPlaceById(){ ... }
// const getPlaceById = function(){ ... }

const getPlacesByUserId = async(req,res,next)=>{
    const userId = req.params.uid;

    let places;
    try {
        places = await Place.find({ creator: userId }) 
    } catch (err) {
        const error = new HttpError(
            "Fetching places failed, please try again later ",
            500
        );

        return next(error);
    }

    if(!places || places.length===0){
        return next(new HttpError("Could not find places for the provided user id."));
    }

    res.json({places : places.map(place=>place.toObject({getters: true}))});
}

const createPlace = async(req ,res ,next)=>{
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return next(new HttpError('Invalid inputs passed, please check your data.',422));
    }

    // One way is to extract each item one by one like 
    // const title = req.body.title;
    const { title , description , address , creator } = req.body;

    let coordinates;

    try {
        coordinates = await getCoordsForAddress(address);
    } catch (error) {
        return next(error);
    }

    const createdPlace = new Place({
        title,
        description,
        location:coordinates,
        address,
        image: req.file.path ,
        creator
    });

    let user;
    try {
        user =  await User.findById(creator);
    } catch (err) {
        const error = new HttpError(
            "Creating place failed,please try again",
            500
        );
        return next(error);
    }

    if(!user){
        const error = new HttpError('Could not find user with provided id',404)
        return next(error);
    }

    console.log(user);

    try {
        const sess = await mongoose.startSession();;
        sess.startTransaction();
        await createdPlace.save({session : sess});
        user.places.push(createdPlace);
        await user.save({session :sess});
        await sess.commitTransaction();


    } catch (err) {
        const error = new HttpError(
            "Creating new place failed, please try again.", 
            500);
        
        return next(error);
    }

    res.status(201).json({place : createdPlace});
}

const updatePlace = async (req,res,next)=>{
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return next( new HttpError('Invalid inputs passed, please check your data.',422));
    }

    const{ title,description } = req.body;
    const placeId = req.params.pid;

    let place;
    try {
        place = await Place.findById(placeId);
    } catch (err) {
        const error = new HttpError("Something went wrong,could not update place",
            500
        );

        return next(error);
    }

    if(place.creator.toString() !== req.userData.userId){
        const error = new HttpError("You are not allowed to edit this place",
            401
        );

        return next(error);
    }

    place.title = title;
    place.description = description;

    try {
        await place.save();
    } catch (err) {
        const error = new HttpError("Something went wrong,could not update place",
            500
        )       
        return next(error);
    }

    res.status(200).json({place:place.toObject({getters:true})});
}


const deletePlace = async (req, res, next) => {
    const placeId = req.params.pid;

    let place;
    try {
        place = await Place.findById(placeId).populate('creator');
    } catch (err) {
        const error = new HttpError("Something went wrong, could not delete place (finding place).", 500);
        console.error("Error during place finding: ", err);
        return next(error);
    }

    if (!place) {
        const error = new HttpError('Could not find place with this id', 404);
        console.error("Place not found with id: ", placeId);
        return next(error);
    }

    if(place.creator.id !== req.userData.userId){
        const error = new HttpError("You are not allowed to delete this place",
            401
        );

        return next(error);
    }

    const imagePath = place.image;

    try {
        const sess = await mongoose.startSession();
        sess.startTransaction();
        await place.deleteOne({ session: sess });
        place.creator.places.pull(place);
        await place.creator.save({ session: sess });
        await sess.commitTransaction();
    } catch (err) {
        const error = new HttpError("Could not delete place, something went wrong (deleting place).", 500);
        console.error("Error during place deletion: ", err);
        return next(error);
    }

    fs.unlink(imagePath, err => {
        console.log(err);
    });
        

    res.status(200).json({ message: 'Deleted place' });
}


exports.getPlaceById = getPlaceById;
exports.getPlacesByUserId = getPlacesByUserId;
exports.createPlace = createPlace;
exports.updatePlace = updatePlace;
exports.deletePlace = deletePlace;