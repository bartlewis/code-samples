//
//  ActivityViewController.m
//  Pegg
//
//  Created by Pegg on 4/4/14.
//  Copyright (c) 2014 Pegg. All rights reserved.
//

#import "ActivityViewController.h"
#import "PSActivity.h"
#import "ActivityTableViewHeader.h"
#import "ActivityTableViewCell.h"
#import "LoaderCell.h"
#import "PeggNavController.h"
#import "BoardNavPagingViewController.h"
#import <Parse/Parse.h>

static NSString *const kActivityTableRowCellIdentifier = @"ActivityTableRowCellIdentifier";
static int const kRowVerticalPadding = 34;


@interface ActivityViewController ()
<UITableViewDataSource, UITableViewDelegate, UITextViewDelegate, ActivityTableViewCellDelegate, UIAlertViewDelegate>

@property (weak, nonatomic) IBOutlet UIView *emptyView;
@property (weak, nonatomic) IBOutlet UIButton *emptyAddPostButton;
@property (weak, nonatomic) IBOutlet UIButton *emptyFindFriendsButton;

@property (nonatomic, weak)   IBOutlet UITableView *activityTableView;

@property (nonatomic, strong) IBOutlet UITableViewController *activityTableViewController;
@property (nonatomic, strong) UIRefreshControl *refreshControl;
@property (nonatomic, strong) UILabel *sizingLabel;
@property (nonatomic, assign) CGSize sizingLabelMaxSize;
@property (nonatomic, strong) UIView                *maskingView;

// Keys are the date, values are arrays of activities from that day.
@property (nonatomic, strong) NSMutableDictionary   *activities;

@property (nonatomic, assign) NSInteger activitiesCount;

// Here we store the keys (date) used in _activity.
// We store them seperately in an array so we can iterate them by order.
@property (nonatomic, strong) NSMutableArray        *activitiesSortedKeys;

@property (nonatomic, strong) NSDateFormatter        *dateFormatterForSortedKeys;
@property (nonatomic, strong) NSDateFormatter        *dateFormatterForHeaderText;


@property (strong, nonatomic) PSActivity *addingFriendFromActivity;

- (IBAction)emptyAddPostAction:(id)sender;
- (IBAction)emptyFindFriendsButton:(id)sender;

@end


@implementation ActivityViewController {
    BOOL _allowNav;
}

// -----------------------------------------------------------------------------
- (void)dealloc
// -----------------------------------------------------------------------------
{
    _activityTableView.delegate       = nil;
    _activityTableView.dataSource     = nil;
}

// -----------------------------------------------------------------------------
- (void)viewDidLoad
// -----------------------------------------------------------------------------
{
    [super viewDidLoad];

    self.edgesForExtendedLayout               = UIRectEdgeNone;

    self.shouldHideLoader = YES;

    // Setup table
    _activityTableView.scrollsToTop = YES;
    _activityTableView.rowHeight = 50;
    _activityTableView.allowsSelection = NO;
    _activityTableView.separatorColor = [UIColor colorWithHexString:COLOR_DIVIDER];

    // Add a UITableViewController to manage the Pull to Refresh Control
    self.activityTableViewController = [[UITableViewController alloc] init];
    _activityTableViewController.tableView = _activityTableView;

    // Add the Pull to Refresh Control
    self.refreshControl = [[UIRefreshControl alloc] init];
    _activityTableViewController.refreshControl = self.refreshControl;
    [self.refreshControl addTarget:self action:@selector(refresh) forControlEvents:UIControlEventValueChanged];

    // Setup table cells
    UINib *nib = [UINib nibWithNibName:@"ActivityTableViewCell" bundle:[NSBundle mainBundle]];
    [_activityTableView registerNib:nib forCellReuseIdentifier:kActivityTableRowCellIdentifier];

    nib = [UINib nibWithNibName:@"LoaderCell" bundle:[NSBundle mainBundle]];
    [_activityTableView registerNib:nib forCellReuseIdentifier:LOADER_CELL_IDENTIFIER];

    // This VC is instantiated fresh each time it is displayed. Based on variances
    // from where other view status bar displays, we might need to relayout. So signal
    // a refresh of the status bar state setting, and then relayout the view based on
    // whatever the result is, if needed.
    [self setNeedsStatusBarAppearanceUpdate];
    [self.view layoutIfNeeded];

    self.activities = [@{} mutableCopy];
    self.activitiesCount = 0;
    self.activitiesSortedKeys = [@[] mutableCopy];

    // The string representation of this date will be used for sorting.
    self.dateFormatterForSortedKeys = [[NSDateFormatter alloc] init];
    [_dateFormatterForSortedKeys setDateFormat:@"yyyyMMdd"];

    // This is how we want the date in the header to show.
    self.dateFormatterForHeaderText = [[NSDateFormatter alloc] init];
    _dateFormatterForHeaderText.dateStyle = NSDateFormatterMediumStyle;
    _dateFormatterForHeaderText.timeStyle = NSDateFormatterNoStyle;
    _dateFormatterForHeaderText.doesRelativeDateFormatting = YES;

    [self parseActivitiesData];

    // Show the empty state or tableview?
    _activityTableView.hidden = (_activitiesCount==0);
    _emptyView.hidden = (_activitiesCount!=0);

    if (!_emptyView.hidden) {
        // Stylize empty state buttons
        for (UIButton *button in @[_emptyAddPostButton, _emptyFindFriendsButton]) {
            [button.layer setBorderColor:[[UIColor colorWithHex:0xffac33] CGColor]];
            [button.layer setBorderWidth:1.0f];
            [button.layer setCornerRadius:6.0f];
        }

        PSAuthenticatedUser *authUser = [PSAuthenticatedUser currentAuthenticatedUser];

        // If the user has at least one item on their board, hide the "add post" button.
        if (authUser.articles && authUser.articles.count > 0) {
            _emptyAddPostButton.hidden = YES;
        }
    }

    [self setBadgeCountToZero];
}

// -----------------------------------------------------------------------------
- (void)viewWillAppear:(BOOL)animated
// -----------------------------------------------------------------------------
{
    [super viewWillAppear:animated];

    [self.navController activateTabBar:NO];

    [self reloadData];
}


// -----------------------------------------------------------------------------
- (void)viewWillLayoutSubviews
// -----------------------------------------------------------------------------
{
    [super viewWillLayoutSubviews];
}

// -----------------------------------------------------------------------------
- (void)viewDidFocus
// -----------------------------------------------------------------------------
{
    [super viewDidFocus];

    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(refresh) name:PSNotificationUserUpdated object:nil];

    // allow navigation to occur on next tap. Doing this to prevent multiple taps from launching multiple navigation events
    _allowNav = YES;
}


// -----------------------------------------------------------------------------
- (void)viewWillBlur
// -----------------------------------------------------------------------------
{
    [super viewWillBlur];

    [[NSNotificationCenter defaultCenter] removeObserver:self name:PSNotificationUserUpdated object:nil];

    // Update the dateViewedActivities timestamp for the user, because it currently only reflects when the user
    // arrived at this page, or manually refreshed, and other sources may have added activities to the table since
    // that point. We dont want those activities being marked as "new".
    // We do this in viewWillBlur, because we want the date to have a chance of being updated before we reach other pages
    [[PSUser currentAuthenticatedUser] updateDateViewedActivityWithCompletion:nil];

    [self.navController activateTabBar:NO];
}

// -----------------------------------------------------------------------------
- (void)parseActivitiesData
// -----------------------------------------------------------------------------
{
    NSMutableDictionary *activities = [_activities mutableCopy]; // we need a copy here!
    NSMutableArray *activitiesSortedKeys = _activitiesSortedKeys;
    NSArray *rawActivities = [[PSUser currentAuthenticatedUser] getActivityArray];
    NSMutableArray *sectionsRequiringSorting = [@[] mutableCopy];

    for (PSActivity *activity in rawActivities) {
        NSString *date = [_dateFormatterForSortedKeys stringFromDate:activity.dateAdded];

        // if unable to parse date, then everything will fail from here on out, so skip this
        // activity
        if (date == nil) continue;

        // Create a new section for this date, if it does not already exist.
        if (!activities[date]) {
            activities[date] = [@[] mutableCopy];

            [activitiesSortedKeys addObject:date];
        }

        // Append this activity to the section for that day, if it does not already exist.
        NSUInteger activityIndex = [activities[date] indexOfObject:activity];
        if (activityIndex == NSNotFound) {
            [activities[date] addObject:activity];

            // Helper for: How many activities do we have locally.
            self.activitiesCount++;

            // If at least one activity was added to this section just now,
            // and it is a NOT a new section we are adding, trigger a resort on the section.
            if (_activities[date] && [sectionsRequiringSorting indexOfObject:date] == NSNotFound) {
                [sectionsRequiringSorting addObject:date];
            }
        }
        else {
            [activities[date] replaceObjectAtIndex:activityIndex withObject:activity];
        }
    }

    // Sort the activity in each section.
    for (NSString *key in sectionsRequiringSorting) {
        NSArray *sectionActivities = [activities objectForKey:key];

        sectionActivities = [sectionActivities sortedArrayUsingComparator:^NSComparisonResult(id a, id b) {
            NSDate *firstDate  = [(PSActivity*)a dateAdded];
            NSDate *secondDate = [(PSActivity*)b dateAdded];

            if (firstDate == nil && secondDate == nil) {
                return NSOrderedSame;
            }

            if (firstDate == nil) {
                return NSOrderedDescending;
            }

            if (secondDate == nil) {
                return NSOrderedAscending;
            }

            return [secondDate compare:firstDate];
        }];

        activities[key] = [sectionActivities mutableCopy];
    }

    // Sort the sections.
    NSSortDescriptor* sort = [NSSortDescriptor sortDescriptorWithKey:nil ascending:NO selector:@selector(localizedCompare:)];
    activitiesSortedKeys = [[activitiesSortedKeys sortedArrayUsingDescriptors:[NSArray arrayWithObject:sort]] mutableCopy];

    // Save values back out to class property
    self.activities = activities;
    self.activitiesSortedKeys = activitiesSortedKeys;
}

// -----------------------------------------------------------------------------
- (void)refresh
// -----------------------------------------------------------------------------
{
    [[PSUser currentAuthenticatedUser] fetchActivity:0 completion:^(id object, NSError *error) {
        if (_refreshControl.isRefreshing) {
            [_refreshControl endRefreshing];
        }

        [self setBadgeCountToZero];

        [self parseActivitiesData];

        [self reloadData];

        // Update the date the user last viewed the activity pane.
        [[PSUser currentAuthenticatedUser] updateDateViewedActivityWithCompletion:nil];
    }];
}

// -----------------------------------------------------------------------------
- (void)didReceiveMemoryWarning
// -----------------------------------------------------------------------------
{
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}

// -----------------------------------------------------------------------------
-(void)fetchMoreActivity
// -----------------------------------------------------------------------------
{
    [[PSUser currentAuthenticatedUser] fetchActivityWithCompletion:^(id object, NSError *error) {
        if (!error) {
            [self parseActivitiesData];

            [self reloadData];
        }
    }];
}

// -----------------------------------------------------------------------------
-(NSInteger)getActivityTotal
// -----------------------------------------------------------------------------
{
    return [[PSUser currentAuthenticatedUser] getActivityTotal];
}

// -----------------------------------------------------------------------------
-(void)reloadData
// -----------------------------------------------------------------------------
{
    [self.activityTableView reloadData];
}

// -----------------------------------------------------------------------------
- (void)addFriend
// -----------------------------------------------------------------------------
{
    PSAuthenticatedUser *authUser = [PSUser currentAuthenticatedUser];

    if (_addingFriendFromActivity) {
        PSActivity *activity = _addingFriendFromActivity;

        // add friend
        [authUser addUserToFriendsWithUserID:activity.userID
                                 andUserName:activity.userName
                               andAvatarName:activity.avatarName
                                  completion:^(id object, NSError *error) {
                                      if (error) {

                                          UIAlertView *alert = [Utils createAlertWithPrefix:STRING_CONTENT_UPDATE_ERROR_PREFIX
                                                                               placeholders:nil
                                                                                  showOther:NO
                                                                                andDelegate:nil];
                                          alert.tag = ALERT_TAG_ERROR;
                                          [alert show];

                                          // undo optimistic assignment
                                          activity.authUserFriend = NO;

                                          // reload data to pickup changes
                                          [self reloadData];


                                      } else {

                                          // actual assignment. Performed again in case the data display state got out of sync
                                          activity.authUserFriend = YES;

                                          // reload data to pickup changes
                                          [self reloadData];
                                      }

                                      [self.navController updateBoardNav];
                                  }];

        // optimistic assignment
        activity.authUserFriend = YES;

        // reload data to pickup changes
        [self reloadData];
  }

    self.addingFriendFromActivity = nil;
}

// -----------------------------------------------------------------------------
- (void) befriendUserForActivity:(PSActivity *)activity
// -----------------------------------------------------------------------------
{
    self.addingFriendFromActivity = activity;

    if (activity.isPrivate) {
        UIAlertView *alert = [Utils createAlertWithPrefix:STRING_FOLLOW_REQUEST_CONFIRM_PREFIX
                                             placeholders:nil
                                                showOther:YES
                                              andDelegate:self];
        alert.tag = ALERT_TAG_FOLLOW_REQUEST;
        [alert show];
    }
    else {
        [self addFriend];
    }
}

// -----------------------------------------------------------------------------
- (void) unfriendUserForActivity:(PSActivity *)activity
// -----------------------------------------------------------------------------
{

    PSAuthenticatedUser *authUser = [PSUser currentAuthenticatedUser];
    // remove friend
    [authUser removeUserFromFriendsWithUserID:activity.userID
                                   completion:^(id object, NSError *error) {
                                       if (error) {

                                           UIAlertView *alert = [Utils createAlertWithPrefix:STRING_CONTENT_UPDATE_ERROR_PREFIX
                                                                                placeholders:nil
                                                                                   showOther:NO
                                                                                 andDelegate:nil];
                                           alert.tag = ALERT_TAG_ERROR;
                                           [alert show];

                                           // undo optimistic assignment
                                           activity.authUserFriend = YES;

                                           // reload data to pickup changes
                                           [self reloadData];

                                       } else {

                                           // actual assignment. Performed again in case the data display state got out of sync
                                           activity.authUserFriend = NO;

                                           // reload data to pickup changes
                                           [self reloadData];

                                       }

                                       [self.navController updateBoardNav];
                                   }];

    // optimistic assignment
    activity.authUserFriend = NO;


    // reload data to pickup changes
    [self reloadData];

}

// -----------------------------------------------------------------------------
- (void)setBadgeCountToZero
// -----------------------------------------------------------------------------
{
    // Flatten the badge locally, and within Parse.
    PFInstallation *currentInstallation = [PFInstallation currentInstallation];
    if (currentInstallation.badge != 0) {
        currentInstallation.badge = 0;
        [currentInstallation saveEventually];
    }
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - Empty State actions
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (IBAction)emptyAddPostAction:(id)sender
// -----------------------------------------------------------------------------
{
    [self.navController.tabBarView setSelectedIndex:TabButtonStateAdd];
}

// -----------------------------------------------------------------------------
- (IBAction)emptyFindFriendsButton:(id)sender
// -----------------------------------------------------------------------------
{
    [self.navController tabToDiscoveryAndSelectPeopleTab];
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - UITableView Delegate Methods
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView
// -----------------------------------------------------------------------------
{
    return [_activitiesSortedKeys count];
}

// -----------------------------------------------------------------------------
- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section
// -----------------------------------------------------------------------------
{
    NSInteger rowCount = [_activities[_activitiesSortedKeys[section]] count];

    // Add a spinner row into the last section if we have more data to fetch.
    if (section == [_activitiesSortedKeys count]-1 && _activitiesCount < self.getActivityTotal) {
        return rowCount + 1;
    }

    return rowCount;
}

// -----------------------------------------------------------------------------
- (CGFloat)tableView:(UITableView *)tableView heightForRowAtIndexPath:(NSIndexPath *)indexPath
// -----------------------------------------------------------------------------
{
    NSArray *activities = _activities[_activitiesSortedKeys[indexPath.section]];

    if (_sizingLabel && indexPath.row < [activities count]) {
        PSActivity *activity = activities[indexPath.row];

        // We need to calculate a row height for these types.
        if (activity.activityType == ActivityTypeConversation ||
            activity.activityType == ActivityTypeConversationMention) {

            // Construct the actual string we will be using in the cell.
            NSString *subText;
            switch (activity.activityType) {
                case ActivityTypeConversation:
                    subText = [NSString stringWithFormat:NSLocalizedString(@"ActivitySubtextConversation", nil), activity.comment];

                    break;

                case ActivityTypeConversationMention:
                    subText = [NSString stringWithFormat:NSLocalizedString(@"ActivitySubtextConversationMention", nil), activity.comment];

                    break;

                default:
                    break;
            }

            // Add the subtext and calculate a size.
            _sizingLabel.text = subText;
            CGSize expectSize = [_sizingLabel sizeThatFits:_sizingLabelMaxSize];

            // Which is bigger? The calculated row height, or the default row height?
            return MAX(expectSize.height + kRowVerticalPadding, tableView.rowHeight);
        }
    }

    return tableView.rowHeight;
}

// -----------------------------------------------------------------------------
- (CGFloat)tableView:(UITableView *)tableView heightForHeaderInSection:(NSInteger)section
// -----------------------------------------------------------------------------
{
    return 25.0f;
}

// -----------------------------------------------------------------------------
- (UIView *)tableView:(UITableView *)tableView viewForHeaderInSection:(NSInteger)section
// -----------------------------------------------------------------------------
{
    NSArray *nib = [[NSBundle mainBundle] loadNibNamed:@"ActivityTableViewHeader" owner:nil options:nil];
    ActivityTableViewHeader *headerCell = [nib firstObject];

    // The first activity item in the section.
    PSActivity *activity = _activities[_activitiesSortedKeys[section]][0];

    // Make a pretty date.
    NSString *date = [_dateFormatterForHeaderText stringFromDate:activity.dateAdded];

    // Set the pretty date as the header text.
    headerCell.titleLabel.text = date;

    return headerCell;
}

// -----------------------------------------------------------------------------
- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath
// -----------------------------------------------------------------------------
{
    NSArray *activities = _activities[_activitiesSortedKeys[indexPath.section]];

    if (indexPath.section == [_activitiesSortedKeys count]-1 && indexPath.row == [activities count]) {
        LoaderCell *cell = [tableView dequeueReusableCellWithIdentifier:LOADER_CELL_IDENTIFIER];
        cell.tag = LOADING_CELL_TAG;
        [cell startAnimating];

        return cell;
    }
    else {
        ActivityTableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:kActivityTableRowCellIdentifier];

        PSActivity *activity = activities[indexPath.row];

        [cell setActivity:activity];

        cell.delegate = self;

        return cell;
    }
}

// -----------------------------------------------------------------------------
- (void)tableView:(UITableView *)tableView willDisplayCell:(UITableViewCell *)cell forRowAtIndexPath:(NSIndexPath *)indexPath
// -----------------------------------------------------------------------------
{
    if (cell.tag == LOADING_CELL_TAG) {
        [self fetchMoreActivity];
    }
    else {
        if (!_sizingLabel) {
            // sizingLabel and sizingLabelMaxSize are used to determine how tall
            // to make the row to accommodate the text. We set them here so that
            // we are working with actual runtime widths, and fonts [from the NIB].

            ActivityTableViewCell *activityCell = (ActivityTableViewCell *)cell;

            activityCell.width = tableView.width;
            [activityCell layoutIfNeeded];

            self.sizingLabel = [[UILabel alloc] init];
            _sizingLabel.font = activityCell.subtextLabel.font;
            _sizingLabel.numberOfLines = activityCell.subtextLabel.numberOfLines;
            _sizingLabel.lineBreakMode = NSLineBreakByWordWrapping;

            self.sizingLabelMaxSize = CGSizeMake(activityCell.subtextLabel.size.width, 999);

            // Now that we have real sizes, fonts, etc., we need to redraw the table.
            [tableView reloadData];
        }
    }
}

// -----------------------------------------------------------------------------
- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath
// -----------------------------------------------------------------------------
{
     [tableView deselectRowAtIndexPath:indexPath animated:NO];
}

// -------------------------------------------------------------------
- (void) setMaskingViewAlpha:(CGFloat) alpha
// -------------------------------------------------------------------
{
    // White Backing View
    if (alpha > 0.f) {
        if (!self.maskingView) {
            self.maskingView = [[UIView alloc] initWithFrame:self.view.bounds];
            _maskingView.backgroundColor = [UIColor whiteColor];
            _maskingView.opaque = NO;
            [self.view addSubview:_maskingView];
        }
        _maskingView.alpha  = alpha;

    }
    else {
        if (_maskingView) {
            [self.maskingView removeFromSuperview];
            self.maskingView = nil;
        }

    }
}


////////////////////////////////////////////////////////////////////////////////
#pragma mark - ActivityTableViewCell Delegate Methods
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (void)activityTableViewCell:(ActivityTableViewCell *)activityTableViewCell didRequestViewActivity:(PSActivity *)activity
// -----------------------------------------------------------------------------
{
    if (_allowNav) {
        _allowNav = NO;

        PSAuthenticatedUser *authUser = [PSUser currentAuthenticatedUser];

        if (activity.activityType == ActivityTypeFollow) {
            // Right icon is for following/unfollowing

            BOOL isFriend = activity.isAuthUserFriend || [authUser getFriendByID:activity.userID];

            // look to see if user is already part of AuthUsers friends
            if (isFriend) {
                [self unfriendUserForActivity:activity];
            }
            else {
                [self befriendUserForActivity:activity];
            }

            _allowNav = YES;
        }
        else if (activity.activityType == ActivityTypeLoveUser) {
            // Show my board.
            [self.navController showBoard:authUser.userName isolatedDisplay:YES];

        }
        else if (activity.activityType == ActivityTypeConversation) {
            // go to conversation
            BoardNavPagingViewController *b = [self.navController showBoard:authUser.userName isolatedDisplay:YES];
            [b showConversation];

            _allowNav = YES;
        }
        else if (activity.activityType == ActivityTypeConversationMention) {
            // go to conversation mention
            BoardNavPagingViewController *b = [self.navController showBoard:activity.fromBoard isolatedDisplay:YES];
            [b showConversation];

            _allowNav = YES;
        }
        else if (activity.activityType == ActivityTypeCaptionMention) {

            // go to board I was mentioned on
            BoardNavPagingViewController *b = [self.navController showBoard:activity.userName isolatedDisplay:YES];
            [b showCaption];

        }
    }
    else {
        DLog(@"Skipping Multiple Nav Request");
    }

}

// -----------------------------------------------------------------------------
- (void)activityTableViewCell:(ActivityTableViewCell *)activityTableViewCell didRequestViewProfile:(NSString *)userName
// -----------------------------------------------------------------------------
{
    if (_allowNav) {
        _allowNav = NO;
        [self.navController showBoard:userName isolatedDisplay:YES];
    }
    else {
        DLog(@"Skipping Multiple Nav Request");
    }
}

// -----------------------------------------------------------------------------
-(void)activityTableViewCell:(ActivityTableViewCell *)activityTableViewCell didSelectNo:(PSActivity *)activity
// -----------------------------------------------------------------------------
{
    PSAuthenticatedUser *authUser = [PSUser currentAuthenticatedUser];
    [authUser declineRequest:activity.userID completion:^(id object, NSError *error) {
        if (error) {
            UIAlertView *alert = [Utils createAlertWithPrefix:STRING_CONTENT_UPDATE_ERROR_PREFIX
                                                 placeholders:nil
                                                    showOther:NO
                                                  andDelegate:nil];
            alert.tag = ALERT_TAG_ERROR;
            [alert show];
        }
    }];

    // Remove this item from the tabledata
    for (NSString *sectionKey in _activities) {
        NSMutableArray *sectionActivities = [_activities objectForKey:sectionKey];

        if ([sectionActivities indexOfObject:activity] != NSNotFound) {
            [sectionActivities removeObject:activity];

            // Is this section now empty?
            if ([sectionActivities count] == 0) {
                [_activities removeObjectForKey:sectionKey];
            }

            break;
        }
    }

    [self reloadData]; // optimistic
}

// -----------------------------------------------------------------------------
-(void)activityTableViewCell:(ActivityTableViewCell *)activityTableViewCell didSelectYes:(PSActivity *)activity
// -----------------------------------------------------------------------------
{
    PSAuthenticatedUser *authUser = [PSUser currentAuthenticatedUser];
    [authUser acceptRequest:activity.userID completion:^(id object, NSError *error) {
        if (error) {
            UIAlertView *alert = [Utils createAlertWithPrefix:STRING_CONTENT_UPDATE_ERROR_PREFIX
                                                 placeholders:nil
                                                    showOther:NO
                                                  andDelegate:nil];
            alert.tag = ALERT_TAG_ERROR;
            [alert show];
        }
    }];

    activity.authUserAccepted = YES; // Optimistic assignment

    [self reloadData]; // optimistic
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - UIAlertViewDelegate Methods
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (void)alertView:(UIAlertView *)alertView didDismissWithButtonIndex:(NSInteger)buttonIndex
// -----------------------------------------------------------------------------
{
    if (alertView.tag == ALERT_TAG_FOLLOW_REQUEST) {
        if (buttonIndex == 1) {
            [self addFriend];
        }
    }
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - Nav Bar Visibility
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (BOOL)showNav
// -----------------------------------------------------------------------------
{
    return NO;
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - Tab Bar Visibility
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (BOOL)showTabs
// -----------------------------------------------------------------------------
{
    return YES;
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - Spinner Type For View
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (SpinnerType)spinnerType
// -----------------------------------------------------------------------------
{
    return SpinnerTypeGray;
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - Nav Bar Title
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (NSString *)title
// -----------------------------------------------------------------------------
{
    return NSLocalizedString(@"TitleActivity", @"");
}

@end
